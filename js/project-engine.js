import { supabase } from './config.js';

/**
 * PROJECT ENGINE
 * Handles all background calculations, status cascades, and financial rollups.
 */

/**
 * 1. rollupToRequirement
 * Sums the cost of all active steps for a requirement and updates the total_budget.
 */
/**
 * Unified Rollup Engine
 * Preserves: Health Score, Member Rate Fallbacks, and Manual Step Injection
 */
export async function rollupToRequirement(requirementId, manualSteps = null) {
    try {
        let tasks = manualSteps;

        // 1. Fetch steps if not provided manually
        if (!tasks) {
            const { data, error: fetchError } = await supabase
                .from('steps')
                .select('estimated_hours, cost, assigned_to, actual_cost, is_active')
                .eq('requirement_id', requirementId)
                .eq('is_active', true);

            if (fetchError) throw fetchError;
            tasks = data || [];
        }

        let totalBudget = 0;
        let totalHours = 0;
        let totalActualCost = 0;
        
        // Access global members for fallback rates
        const members = window.teamMembers || [];
        const blendedRate = window.projectBlendedRate || 0;

        // 2. Comprehensive Calculation Loop
        tasks.forEach(s => {
            const hours = parseFloat(s.estimated_hours) || 0;
            let taskCost = parseFloat(s.cost) || 0;
            const actCost = parseFloat(s.actual_cost) || 0;

            // --- RE-INTEGRATED: Fallback Rate Logic ---
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
        });

        // --- RE-INTEGRATED: Health Score Logic ---
        let healthScore = 100;
        if (totalBudget > 0 && totalActualCost > totalBudget) {
            healthScore = Math.max(0, Math.round((totalBudget / totalActualCost) * 100));
        }

        // 3. Database Update
        const { error: updateError } = await supabase
            .from('requirements')
            .update({ 
                total_budget: totalBudget,
                estimated_hours: totalHours,
                health_score: healthScore,
                updated_at: new Date().toISOString()
            })
            .eq('req_id', requirementId);

        if (updateError) throw updateError;

        return { totalBudget, totalHours, healthScore };
    } catch (err) {
        console.error("? Engine Rollup Error:", err.message);
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
                .eq('req_id', requirementId);
            
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
 */
export const initializeProjectEngine = () => {
    console.log("?? Project Engine: Initializing Connection...");

    const channel = supabase
        .channel('project-automation-channel')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'steps' }, 
            async (payload) => {
                // THIS IS THE LOG WE ARE LOOKING FOR
                console.log('? ENGINE TRIGGERED: Change detected in Steps!', payload);
                
                const requirementId = payload.new?.requirement_id || payload.old?.requirement_id;
                const projectId = localStorage.getItem('selected_project_id');

                if (requirementId) {
                    // 1. Run the budget math (Rollup)
                    await rollupToRequirement(requirementId);
                    
                    // 2. Run the status automation (Cascade Completion)
                    await syncHierarchyStatus(requirementId, projectId);
                    
                    // 3. Refresh the UI if the bridge is connected
                    if (typeof window.loadRequirements === 'function') {
                        console.log("?? Refreshing UI via global hook...");
                        window.loadRequirements();
                    }
                }
            }
        )
        .subscribe((status) => {
            // THIS WILL TELL US IF THE CONNECTION IS BLOCKED
            console.log("?? Realtime Status:", status);
            
            if (status === 'CHANNEL_ERROR') {
                console.error("? Realtime Connection Failed. Check Supabase 'Replication' settings.");
            }
        });
};

// Start the listener automatically when this module is loaded
initializeProjectEngine();