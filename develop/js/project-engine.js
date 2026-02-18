import { supabase } from './config.js';

/**
 * 1. rollupToRequirement
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
        console.log(`?? Engine: Req ${requirementId} updated to v${maxVersion}. Budget: $${totalBudget}`);
        return { totalBudget, totalHours, healthScore, maxVersion };
    } catch (err) {
        console.error("? Engine Rollup Error:", err.message);
        return null;
    }
}

/**
 * 2. Hierarchy & Governance Methods
 * Combined into the projectEngine object for unified import.
 */
export const projectEngine = {
    calculateGovernanceDelta: (oldCost, newCost, threshold) => {
        const diff = newCost - oldCost;
        const percentChange = oldCost === 0 ? (newCost > 0 ? 100 : 0) : (diff / oldCost) * 100;
        return {
            percentChange: percentChange.toFixed(1),
            diff: diff,
            isBreached: percentChange > threshold
        };
    },

    createAutomatedCR: async (projectId, reqId, stepTitle, deltaObj, reason) => {
        const { data: latest } = await supabase
            .from('change_items')
            .select('change_number')
            .eq('project_id', projectId)
            .order('change_number', { ascending: false })
            .limit(1)
            .single();

        const newNumber = (latest?.change_number || 0) + 1;

        const { data: cr, error } = await supabase.from('change_items').insert([{
            project_id: projectId,
            requirement_id: reqId,
            change_number: newNumber,
            title: `Breach: ${stepTitle}`,
            change_reason: reason,
            impact_analysis: `Automated CR: Cost increased by ${deltaObj.percentChange}% ($${deltaObj.diff.toLocaleString()}).`,
            change_status: 'Pending',
            total_cost_rollup: deltaObj.diff,
            created_at: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        return cr;
    }
};

/**
 * 3. Additional Support Functions (Sync, History, Listeners)
 */
export async function syncHierarchyStatus(requirementId, projectId) {
    try {
        const { data: steps } = await supabase.from('steps').select('status').eq('requirement_id', requirementId).eq('is_active', true);
        if (steps?.length > 0 && steps.every(s => s.status === 'Complete')) {
            await supabase.from('requirements').update({ status: 'Complete' }).eq('req_id', requirementId);
        }
    } catch (err) { console.error("? Status Sync Error:", err.message); }
}

// REAL-TIME LISTENER
export const initializeProjectEngine = () => {
    console.log("??? Project Engine: Initializing Real-Time Governance...");
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

// Legacy Window Mappings
window.engineRollup = rollupToRequirement;
window.projectEngine = projectEngine;