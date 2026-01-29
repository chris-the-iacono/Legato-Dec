import { supabase } from './config.js';

/**
 * PROJECT ENGINE
 * Handles all background calculations, status cascades, and financial rollups.
 */

/**
 * 1. rollupToRequirement
 * Sums the cost of all active steps for a requirement and updates the total_budget.
 */
export async function rollupToRequirement(requirementId) {
    try {
        // Fetch all active steps for this requirement
        const { data: steps, error: fetchError } = await supabase
            .from('steps')
            .select('cost')
            .eq('requirement_id', requirementId)
            .eq('is_active', true);

        if (fetchError) throw fetchError;

        // Sum the costs
        const newTotal = steps.reduce((sum, step) => sum + (parseFloat(step.cost) || 0), 0);

        // Update the requirement's budget
        const { error: updateError } = await supabase
            .from('requirements')
            .update({ total_budget: newTotal })
            .eq('req_id', requirementId); //changed 'id' to 'req_id'

        if (updateError) throw updateError;

        console.log(`Rollup Complete: Req ${requirementId} new total: $${newTotal}`);
        return newTotal;
    } catch (err) {
        console.error("Rollup Error:", err.message);
        return null;
    }
}

/**
 * 2. syncHierarchyStatus
 * Checks if all children are "Complete" and updates the parent status.
 * This cascades from Task -> Requirement and Requirement -> Project.
 */
export async function syncHierarchyStatus(requirementId, projectId) {
    try {
        // STEP A: Check Tasks -> Requirement
        const { data: steps, error: stepError } = await supabase
            .from('steps')
            .select('status')
            .eq('requirement_id', requirementId)
            .eq('is_active', true);

        if (stepError) throw stepError;

        const allStepsComplete = steps.length > 0 && steps.every(s => s.status === 'Complete');

        if (allStepsComplete) {
            await supabase
                .from('requirements')
                .update({ status: 'Complete' })
                .eq('id', requirementId);
            
            console.log(`Requirement ${requirementId} automatically set to Complete.`);
        }

        // STEP B: Check Requirements -> Project
        if (projectId) {
            const { data: reqs, error: reqError } = await supabase
                .from('requirements')
                .select('status')
                .eq('project_id', projectId);

            if (reqError) throw reqError;

            const allReqsComplete = reqs.length > 0 && reqs.every(r => r.status === 'Complete');

            if (allReqsComplete) {
                await supabase
                    .from('projects')
                    .update({ status: 'Complete' })
                    .eq('id', projectId);
                
                console.log(`Project ${projectId} automatically set to Complete.`);
            }
        }
    } catch (err) {
        console.error("Status Sync Error:", err.message);
    }
}

/**
 * 3. REAL-TIME LISTENER (The "Brain")
 * Listens for changes to the steps table and automatically triggers the engine.
 * This removes the need to manually call these functions in your UI files.
 */
export const initializeProjectEngine = () => {
    console.log("Project Engine Listener initialized...");

    supabase
        .channel('public:steps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'steps' }, async (payload) => {
            console.log('Change detected in Steps table:', payload);
            
            const requirementId = payload.new?.requirement_id || payload.old?.requirement_id;
            const projectId = localStorage.getItem('selected_project_id');

            if (requirementId) {
                // Run the budget math
                await rollupToRequirement(requirementId);
                // Run the status automation
                await syncHierarchyStatus(requirementId, projectId);
                
                // Refresh the UI if a refresh function exists on the global window
                if (window.loadRequirements) {
                    window.loadRequirements();
                }
            }
        })
        .subscribe();
};

// Start the listener automatically when this module is loaded
initializeProjectEngine();