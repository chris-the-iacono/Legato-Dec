import { supabase } from './config.js';

/**
 * rollupToRequirement
 * Sums cost of active steps and updates the requirement baseline.
 */
export async function rollupToRequirement(requirementId, manualSteps = null) {
    try {
        let tasks = manualSteps;
        if (!tasks) {
            const { data, error: fetchError } = await supabase
                .from('steps')
                .select('estimated_hours, cost, assigned_to, actual_cost, is_active, version_number')
                .eq('requirement_id', requirementId)
                .eq('is_active', true);

            if (fetchError) throw fetchError;
            tasks = data || [];
        }

        let totalBudget = 0, totalHours = 0, totalActualCost = 0, maxVersion = 1;
        const members = window.teamMembers || [];
        const blendedRate = window.projectBlendedRate || 0;

        tasks.forEach(s => {
            const hours = parseFloat(s.estimated_hours) || 0;
            let taskCost = parseFloat(s.cost) || 0;
            const actCost = parseFloat(s.actual_cost) || 0;
            const vNum = parseInt(s.version_number) || 1;

            if (taskCost === 0 && hours > 0) {
                const user = members.find(m => m.user_id === s.assigned_to);
                const effectiveRate = (user && parseFloat(user.hourly_cost) > 0) ? parseFloat(user.hourly_cost) : blendedRate;
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
        console.log(`Engine: Req ${requirementId} updated to v${maxVersion}. Budget: $${totalBudget}`);
        return { totalBudget, totalHours, healthScore, maxVersion };
    } catch (err) {
        console.error("Engine Rollup Error:", err.message);
        return null;
    }
}

/**
 * Hierarchy & Governance Methods
 */
export const projectEngine = {
    calculateGovernanceDelta: (oldCost, newCost, threshold, oldHours = 0, newHours = 0) => {
        const diffCost = newCost - oldCost;
        const diffHours = newHours - oldHours;
        const percentChange = oldCost === 0 ? (newCost > 0 ? 100 : 0) : (diffCost / oldCost) * 100;
        
        return {
            percentChange: percentChange.toFixed(1),
            diffCost: diffCost,
            diffHours: diffHours,
            oldCost: oldCost,
            oldHours: oldHours,
            newCost: newCost,
            newHours: newHours,
            isBreached: percentChange > threshold
        };
    },

    createAutomatedCR: async (projectId, reqId, stepTitle, deltaObj, reason) => {
    try {
        // 1. Get the latest sequence number for this project
        // Note: Using limit(1) without .single() to avoid errors on first-time CRs
        const { data: latest } = await supabase
            .from('change_items')
            .select('change_number')
            .eq('project_id', projectId)
            .order('change_number', { ascending: false })
            .limit(1);

        const newNumber = (latest && latest.length > 0 ? latest[0].change_number : 0) + 1;

        // 2. Insert the CR with full delta details
        // FIX: Ensuring change_accountable uses window session or auth fallback
        const activeUserId = window.sessionData?.user_id || (await supabase.auth.getUser()).data.user?.id;

        const { data: cr, error } = await supabase.from('change_items').insert([{
            project_id: projectId,
            requirement_id: reqId,
            change_number: newNumber,
            title: `Breach: ${stepTitle}`,
            change_type: 'Threshold Violation',
            change_reason: reason,
            impact_analysis: `Automated CR generated due to budget breach. 
                              Cost increased by ${deltaObj.percentChange}% 
                              (+$${deltaObj.diffCost.toLocaleString()}). 
                              Original Hours: ${deltaObj.oldHours} -> New Hours: ${deltaObj.newHours}`,
            change_status: 'Pending',
            requested_hours: deltaObj.diffHours, // The Delta
            original_hours: deltaObj.oldHours,   // The Baseline
            total_cost_rollup: deltaObj.diffCost, // The Dollar Delta
            change_accountable: activeUserId,
            created_at: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        console.log(`Governance: Automated CR-${newNumber} created for Req ${reqId}`);
        return cr;
    } catch (err) {
        console.error("Governance Error: Failed to create automated CR", err.message);
        return null;
    }
}
};

/**
 * Additional Support Functions
 */
export async function syncHierarchyStatus(requirementId, projectId) {
    try {
        const { data: steps } = await supabase.from('steps').select('status').eq('requirement_id', requirementId).eq('is_active', true);
        if (steps?.length > 0 && steps.every(s => s.status === 'Complete')) {
            await supabase.from('requirements').update({ status: 'Complete' }).eq('req_id', requirementId);
        }
    } catch (err) { console.error("Status Sync Error:", err.message); }
}

// REAL-TIME LISTENER
export const initializeProjectEngine = () => {
    console.log("Project Engine: Initializing Real-Time Governance...");
    supabase.channel('project-automation-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'steps' }, async (payload) => {
            const reqId = payload.new?.requirement_id || payload.old?.requirement_id;
            if (reqId) {
                await rollupToRequirement(reqId);
                await syncHierarchyStatus(reqId, localStorage.getItem('selected_project_id'));
                if (typeof window.loadRequirements === 'function') window.loadRequirements();
            }
        })
        .subscribe();
};

// Start the listener
initializeProjectEngine();

// Window Mappings
window.engineRollup = rollupToRequirement;
window.projectEngine = projectEngine;