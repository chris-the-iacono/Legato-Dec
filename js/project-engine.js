import { supabase } from './config.js';

/**
 * PROJECT ENGINE
 * Handles all background calculations, status cascades, and financial rollups.
 */

/**
 * 1. rollupToRequirement
 * Sums the cost of all active steps, finds the highest version, and updates the requirement.
 * Corrected to use 'req_id' as the primary key for the requirements table.
 */
export async function rollupToRequirement(requirementId, manualSteps = null) {
    try {
        let tasks = manualSteps;

        // 1. Fetch steps if not provided manually
        if (!tasks) {
            const { data, error: fetchError } = await supabase
                .from('steps')
                .select('estimated_hours, cost, assigned_to, actual_cost, is_active, version_number')
                .eq('requirement_id', requirementId)
                .eq('is_active', true);

            if (fetchError) throw fetchError;
            tasks = data || [];
        }

        let totalBudget = 0;
        let totalHours = 0;
        let totalActualCost = 0;
        let maxVersion = 1; // Default to v1 baseline
        
        const members = window.teamMembers || [];
        const blendedRate = window.projectBlendedRate || 0;

        // 2. Comprehensive Calculation Loop
        tasks.forEach(s => {
            const hours = parseFloat(s.estimated_hours) || 0;
            let taskCost = parseFloat(s.cost) || 0;
            const actCost = parseFloat(s.actual_cost) || 0;
            const vNum = parseInt(s.version_number) || 1;

            if (taskCost === 0 && hours > 0) {
                const user = members.find(m => m.user_id === s.assigned_to);
                const effectiveRate = (user && parseFloat(user.hourly_cost) > 0) 
                    ? parseFloat(user.hourly_cost) 
                    : blendedRate;
                taskCost = hours * effectiveRate;
            }

            totalBudget += taskCost;
            totalHours += hours;
            totalActualCost += actCost;

            if (vNum > maxVersion) maxVersion = vNum;
        });

        let healthScore = 100;
        if (totalBudget > 0 && totalActualCost > totalBudget) {
            healthScore = Math.max(0, Math.round((totalBudget / totalActualCost) * 100));
        }

        // 3. Database Update
        // CORRECTED: Using 'req_id' to match your specific schema PK
        const { error: updateError } = await supabase
            .from('requirements')
            .update({ 
                total_budget: totalBudget,
                estimated_hours: totalHours,
                health_score: healthScore,
                version_number: maxVersion,
                updated_at: new Date().toISOString()
            })
            .eq('req_id', requirementId); 

        if (updateError) throw updateError;

        console.log(`?? Engine: Req ${requirementId} updated to v${maxVersion}. Budget: $${totalBudget}`);

        return { totalBudget, totalHours, healthScore, maxVersion };
    } catch (err) {
        console.error("? Engine Rollup Error:", err.message);
        return null;
    }
}

/**
 * 2. syncHierarchyStatus
 * Checks if all children are "Complete" and updates the parent status.
 */
export async function syncHierarchyStatus(requirementId, projectId) {
    try {
        const { data: steps, error: stepError } = await supabase
            .from('steps')
            .select('status')
            .eq('requirement_id', requirementId)
            .eq('is_active', true);

        if (stepError) throw stepError;

        const allStepsComplete = steps.length > 0 && steps.every(s => s.status === 'Complete');

        if (allStepsComplete) {
            // CORRECTED: Using 'req_id'
            await supabase
                .from('requirements')
                .update({ status: 'Complete' })
                .eq('req_id', requirementId);
            
            console.log(`? Requirement ${requirementId} automatically set to Complete.`);
        }

        if (projectId) {
            const { data: reqs, error: reqError } = await supabase
                .from('requirements')
                .select('status')
                .eq('project_id', projectId);

            if (reqError) throw reqError;

            const allReqsComplete = reqs.length > 0 && reqs.every(r => r.status === 'Complete');

            if (allReqsComplete) {
                // Projects usually use 'id'
                await supabase
                    .from('projects')
                    .update({ status: 'Complete' })
                    .eq('id', projectId);
                
                console.log(`?? Project ${projectId} automatically set to Complete.`);
            }
        }
    } catch (err) {
        console.error("? Status Sync Error:", err.message);
    }
}

window.saveRequirementGovernance = async function() {
    // 1. Identify Context (New vs Update)
    const reqId = window.currentReqId || window.selectedReqId;
    const isUpdate = !!reqId;

    // 2. Pull Data from UI
    const nameInput = document.getElementById('req-title-input').value; 
    const assigneeId = document.getElementById('req-assign-select').value;
    const assignDropdown = document.getElementById('req-assign-select');
    const assigneeName = assignDropdown.options[assignDropdown.selectedIndex]?.text || 'Unassigned';
    const hours = parseFloat(document.getElementById('req-hours-input').value) || 0;
    const changeReason = document.getElementById('req-change-reason').value;
    const versionDisplay = document.getElementById('req-version-display');
    const currentVersion = parseInt(versionDisplay ? versionDisplay.innerText : 1) || 1;

    // 3. Validation
    if (!nameInput) { alert("Requirement Title is required."); return; }
    if (isUpdate && (!changeReason || changeReason.trim().length < 5)) {
        alert("Please provide a reason for this governance update (min 5 chars).");
        return;
    }

    try {
        const nextVersion = isUpdate ? currentVersion + 1 : 1;
        
        // 4. Construct Payload - Corrected keys for requirements table
        const payload = {
            title: nameInput,         // AUDIT FIX: Was 'name'
            assigned_to: assigneeId,  // AUDIT FIX: Was 'user_id'
            version_number: nextVersion,
            estimated_hours: hours,
            updated_at: new Date().toISOString()
        };

        let result;
        if (isUpdate) {
            // AUDIT FIX: Primary Key is 'req_id'
            result = await supabase.from('requirements')
                .update(payload)
                .eq('req_id', reqId)
                .select()
                .single();
        } else {
            // New Requirement Setup
            const newRecord = { 
                ...payload, 
                project_id: localStorage.getItem('selected_project_id'),
                tenant_id: window.sessionData.tenantId 
            };
            result = await supabase.from('requirements').insert([newRecord]).select().single();
        }

        if (result.error) throw result.error;

        // 5. Log to History Table
        const { error: histError } = await supabase
            .from('requirement_history')
            .insert([{
                requirement_id: isUpdate ? reqId : result.data.req_id, // AUDIT FIX: Was .id
                version_number: nextVersion,
                change_summary: isUpdate ? `Baseline updated to v${nextVersion}` : 'Requirement Created',
                change_reason: isUpdate ? changeReason : 'Initial Creation',
                changed_by_name: window.sessionData?.full_name || 'System User',
                assigned_to_name: assigneeName,
                total_budget: hours 
            }]);

        if (histError) console.error("History Log Error:", histError);

        // 6. UI Refresh
        alert(isUpdate ? "Governance Update Saved." : "New Requirement Created.");
        if (document.getElementById('req-change-reason')) {
            document.getElementById('req-change-reason').value = "";
        }
        
        if (window.closeReqSlider) window.closeReqSlider();
        if (window.loadRequirements) await window.loadRequirements();

    } catch (err) {
        console.error("Critical Save Error:", err.message);
        alert("Save failed: " + err.message);
    }
};
window.loadRequirementHistory = async function(reqId) {
    const historyContainer = document.getElementById('req-history-list');
    if (!historyContainer) return;

    // AUDIT FIX: Sanitize ID
    const cleanId = String(reqId).trim().replace(/['"]/g, '');

    try {
        // 1. Fetch Governance History (Indigo Cards) - Baseline changes
        const { data: govHistory, error: govError } = await supabase
            .from('requirement_history')
            .select('*')
            .eq('requirement_id', cleanId)
            .order('created_at', { ascending: false });

        if (govError) throw govError;

        // 2. Fetch Formal Change Requests (Amber Cards) - Threshold breaches
        const { data: formalCRs, error: crError } = await supabase
            .from('change_items')
            .select('*, user_profiles:change_accountable(full_name)')
            .eq('requirement_id', cleanId)
            .order('created_at', { ascending: false });

        if (crError) throw crError;

        // 3. Fetch Operational History via Virtual Path (Blue Cards)
        const { data: steps, error: stepsError } = await supabase
            .from('steps')
            .select('step_id')
            .eq('requirement_id', cleanId);

        if (stepsError) throw stepsError;
        
        const stepIds = steps.map(s => s.step_id);
        let taskNotes = [];

        // 4. STEP B: Operational Note Fetch 
        // FIX: Corrected task_id -> step_id AND note -> note_text
        if (stepIds.length > 0) {
            const { data: notes, error: notesError } = await supabase
                .from('task_notes')
                .select('*')
                .in('step_id', stepIds) 
                .ilike('note_text', '%CHANGE REQUEST%') 
                .order('created_at', { ascending: false });
            
            if (!notesError) taskNotes = notes || [];
        }

        // 5. Combine and Sort all 3 Streams
        const combined = [
            ...(govHistory || []).map(h => ({ ...h, type: 'GOV' })),
            ...(formalCRs || []).map(c => ({ ...c, type: 'CR' })),
            ...taskNotes.map(n => ({ ...n, type: 'OPS' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // 6. Clear and Render
        historyContainer.innerHTML = '';
        
        if (combined.length === 0) {
            historyContainer.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-4">No history records found.</p>';
            return;
        }

        combined.forEach(item => {
            const dateStr = new Date(item.created_at).toLocaleString();
            let cardHtml = '';

            if (item.type === 'GOV') {
                cardHtml = `
                    <div class="p-3 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm mb-3">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold text-indigo-600 uppercase">Baseline v${item.version_number}</span>
                            <span class="text-[9px] text-indigo-400">${dateStr}</span>
                        </div>
                        <p class="text-xs font-semibold text-indigo-900">${item.change_summary}</p>
                        <p class="text-[11px] text-indigo-700 mt-1 italic">"${item.change_reason}"</p>
                        <div class="mt-2 text-[10px] text-indigo-500 font-medium">By: ${item.changed_by_name}</div>
                    </div>`;
            } else if (item.type === 'CR') {
                cardHtml = `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm mb-3">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold text-amber-700 uppercase">Change Request #${item.change_number || ''}</span>
                            <span class="text-[9px] text-amber-500">${dateStr}</span>
                        </div>
                        <p class="text-xs font-bold text-amber-900">${item.title}</p>
                        <div class="flex justify-between mt-2 text-[9px] font-black uppercase tracking-widest">
                            <span class="px-1.5 py-0.5 rounded ${item.change_status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                                ${item.change_status}
                            </span>
                            <span class="text-amber-600">Accountable: ${item.user_profiles?.full_name || 'System'}</span>
                        </div>
                    </div>`;
            } else {
                cardHtml = `
                    <div class="p-3 bg-blue-50 border border-blue-100 rounded-lg shadow-sm mb-3">
                        <div class="flex justify-between items-start mb-1">
                            <span class="text-[10px] font-bold text-blue-600 uppercase">Task Adjustment</span>
                            <span class="text-[9px] text-blue-400">${dateStr}</span>
                        </div>
                        <p class="text-xs text-blue-800 line-clamp-3">${item.note_text}</p>
                        <div class="mt-2 text-[10px] text-blue-500 font-mono">Source: Step ID ${item.step_id}</div>
                    </div>`;
            }
            historyContainer.insertAdjacentHTML('beforeend', cardHtml);
        });

    } catch (err) {
        console.error("Error loading history:", err.message);
        historyContainer.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Failed to load history.</p>';
    }
};

/**
 * project-engine.js 
 * Updated logic for your existing change_items schema
 */

window.recordChangeDraft = async (stepId, newData, delta) => {
    // 1. Context Fetch
    const { data: step } = await supabase
        .from('steps')
        .select(`
            requirement_id, 
            tenant_id, 
            estimated_hours,
            projects(id)
        `)
        .eq('step_id', stepId)
        .single();

    // 2. Create formal Change Item record using your exact schema
    const { data: changeItem, error: crError } = await supabase
        .from('change_items')
        .insert([{
            project_id: step.projects.id,
            tenant_id: step.tenant_id,
            requirement_id: step.requirement_id,
            title: `Variance: ${newData.title}`,
            change_type: 'Cost/Schedule Variance',
            change_reason: newData.changeReason || 'Threshold exceeded',
            original_hours: step.estimated_hours,
            requested_hours: newData.estimated_hours,
            total_cost_rollup: newData.cost,
            change_status: 'Pending',
            change_accountable: window.sessionData?.userId, // The user who triggered the change
            adds_requirement: false,
            adds_steps: false
        }]).select().single();

    if (crError) throw crError;

    // 3. Virtual Path Audit Trail
    const auditContent = `?? CHANGE REQUEST #${changeItem.change_number} GENERATED: ${delta.toFixed(1)}% variance.`;
    await window.appendNoteToActivity(stepId, auditContent);

    return changeItem;
};

/**
 * 3. REAL-TIME LISTENER
 */
export const initializeProjectEngine = () => {
    console.log("?? Project Engine: Initializing Connection...");

    const channel = supabase
        .channel('project-automation-channel')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'steps' }, 
            async (payload) => {
                const requirementId = payload.new?.requirement_id || payload.old?.requirement_id;
                const projectId = localStorage.getItem('selected_project_id');

                if (requirementId) {
                    await rollupToRequirement(requirementId);
                    await syncHierarchyStatus(requirementId, projectId);
                    
                    if (typeof window.loadRequirements === 'function') {
                        window.loadRequirements();
                    }
                }
            }
        )
        .subscribe();
};

initializeProjectEngine();
window.engineRollup = rollupToRequirement;