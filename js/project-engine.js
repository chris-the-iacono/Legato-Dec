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

window.reassignAccountability = async function() {
    const reqId = window.currentReqId; // Assuming this is set when opening the slider
    const newUserId = document.getElementById('req-assign-select').value;
    const selectEl = document.getElementById('req-assign-select');
    const newUserName = selectEl.options[selectEl.selectedIndex].text;
    const changeReason = document.getElementById('req-change-reason').value;
    const currentBudget = document.getElementById('req-hours-input').value;
    const versionDisplay = document.getElementById('req-version-display');
    const currentVersion = parseInt(versionDisplay.innerText) || 1;

    if (!changeReason || changeReason.trim().length < 5) {
        alert("Please provide a meaningful reason for this governance change (min 5 chars).");
        return;
    }

    try {
        // 1. Update the Main Requirement Table
        const { error: reqError } = await supabase
            .from('requirements')
            .update({ 
                user_id: newUserId,
                version_number: currentVersion + 1 
            })
            .eq('id', reqId);

        if (reqError) throw reqError;

        // 2. Insert the History Snapshot
        const { error: histError } = await supabase
            .from('requirement_history')
            .insert([{
                requirement_id: reqId,
                version_number: currentVersion + 1,
                change_summary: `Accountability assigned to ${newUserName}`,
                change_reason: changeReason,
                changed_by_name: window.currentUserFullName || 'System User', 
                assigned_to_name: newUserName,
                total_budget: parseFloat(currentBudget) || 0
            }]);

        if (histError) throw histError;

        // 3. UI Cleanup & Refresh
        document.getElementById('req-change-reason').value = ""; // Clear reason
        versionDisplay.innerText = currentVersion + 1; // Increment display
        
        // Refresh the audit trail using our new unified function
        if (window.loadRequirementHistory) {
            await window.loadRequirementHistory(reqId);
        }

        alert("Governance record updated successfully.");

    } catch (err) {
        console.error("Governance Update Failed:", err.message);
        alert("Failed to update accountability. Check console for details.");
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