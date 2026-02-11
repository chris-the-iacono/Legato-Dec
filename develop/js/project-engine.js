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