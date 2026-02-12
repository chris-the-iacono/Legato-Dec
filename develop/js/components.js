// js/components.js
import { handleSignOut } from './auth.js';
// NEW: Import the project engine logic
import { rollupToRequirement, syncHierarchyStatus } from './project-engine.js';
import { supabase } from './config.js';

/**
 * Renders the Tabbed UI Header with Admin, Navigation features, and Settings Gear.
 */
export function renderProjectHeader(session, activeTab, projectName = "Select Project") {
    const headerElement = document.getElementById('main-header');
    
    if (!headerElement) return;

    // Store session globally for modal access
    window.currentSession = session;

    // 1. DYNAMIC TAB TITLE
    document.title = `${projectName} | ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;

    // 2. ENVIRONMENT BADGE
    const currentPath = window.location.pathname;
    let envBadge = '';
    if (currentPath.includes('/develop/')) {
        envBadge = '<span class="bg-yellow-500 text-black px-2 py-0.5 text-[10px] font-bold rounded ml-2 shadow-sm animate-pulse">DEV</span>';
    } else if (currentPath.includes('/test/')) {
        envBadge = '<span class="bg-blue-500 text-white px-2 py-0.5 text-[10px] font-bold rounded ml-2 shadow-sm animate-pulse">STAGE</span>';
    }

    // 3. ADMIN CHECK & NAVIGATION LOGIC
    const isAdmin = session.role === 'admin' || session.role === 'owner';
    const isDashboard = activeTab === 'dashboard';
    const isWindshield = activeTab === 'windshield';

    // NAVIGATION REROUTING:
    // If we are deep in requirements/risks, go back to Windshield.
    // If we are on Windshield, go back to Project Selection.
    const backDestination = (isWindshield) ? 'index.html' : 'windshield.html';

    // 4. DEFINE TABS (Filtered by purchased modules)
    const allTabs = [
        { id: 'requirements', name: 'Requirements & Estimates', link: 'requirements.html', enabled: session.modules.module_requirements },
        { id: 'risks', name: 'Risks', link: 'risks.html', enabled: session.modules.module_risks },
        { id: 'issues', name: 'Issues', link: 'issues.html', enabled: session.modules.module_issues },
        { id: 'changes', name: 'Changes', link: 'changes.html', enabled: session.modules.module_changes }
    ];

    const visibleTabs = allTabs.filter(tab => tab.enabled);

    // 5. RENDER THE HTML
    headerElement.innerHTML = `
        <header class="bg-white border-b border-gray-200 sticky top-0 z-[1001] shadow-sm">
            <div class="max-w-7xl mx-auto px-4 flex justify-between items-center h-14 border-b border-gray-100">
                <div class="flex items-center space-x-4">
                    ${!isDashboard ? `
                        <button onclick="window.location.href='${backDestination}'" class="p-1.5 hover:bg-gray-100 rounded-full transition text-gray-400 mr-1" title="Back">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                    ` : ''}

                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center leading-none">
    						${session.tenantName ? session.tenantName + ' Workspace' : 'Workspace'} ${envBadge}
						</span>
                        <h1 class="text-sm font-bold text-gray-900 mt-1">${projectName}</h1>
                    </div>
                </div>

                <div class="flex items-center space-x-3">
                    <div class="hidden sm:flex flex-col items-end mr-2 pr-3 border-r border-gray-100 text-right">
                        <span class="text-[11px] font-black text-gray-900 leading-none">${session.fullName || 'User'}</span>
                        <span class="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter mt-1">${session.role || 'Member'}</span>
                    </div>

                    <div class="relative" id="header-settings-wrapper" onmouseleave="document.getElementById('settings-dropdown').classList.add('hidden')">
                        <button onclick="document.getElementById('settings-dropdown').classList.toggle('hidden')" 
                                class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-gray-100 bg-gray-50/50"
                                title="Project Settings">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        <div id="settings-dropdown" class="hidden absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl z-[2000] py-2 overflow-hidden">
                            <div class="px-4 py-2 border-b border-gray-50 mb-1">
                                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Configuration</p>
                            </div>
                            <button onclick="window.openProjectDetails()" class="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 transition-colors">Edit Details</button>
                            <button class="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 transition-colors">Configure Rates</button>
                            <button class="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-indigo-50 transition-colors">Audit History</button>
                            <div class="border-t border-gray-100 mt-1 pt-1">
                                <button onclick="window.archiveProject()" class="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors">Archive Project</button>
                            </div>
                        </div>
                    </div>

                    ${isAdmin ? `
                        <a href="admin.html" class="hidden md:inline-flex text-[11px] font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition shadow-sm uppercase tracking-tight">
                            Team
                        </a>
                    ` : ''}
                    
                    <div class="h-6 w-px bg-gray-200 mx-1"></div>
                    
                    <button id="global-signout" class="text-xs font-bold text-gray-400 hover:text-red-600 transition">
                        Sign Out
                    </button>
                </div>
            </div>

            ${(!isDashboard) ? `
                <div class="max-w-7xl mx-auto px-4">
                    <nav class="-mb-px flex space-x-8 overflow-x-auto no-scrollbar">
                        ${visibleTabs.map(tab => `
                            <a href="${tab.link}" 
                               class="whitespace-nowrap py-3 px-1 border-b-2 font-bold text-xs transition-all duration-200 tracking-tight
                               ${activeTab === tab.id 
                                   ? 'border-indigo-500 text-indigo-600' 
                                   : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'}">
                                ${tab.name}
                            </a>
                        `).join('')}
                    </nav>
                </div>
            ` : ''}
        </header>
    `;

    // 6. ATTACH EVENTS
    const signOutBtn = document.getElementById('global-signout');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleSignOut(); 
        });
    }
}

/**
 * DYNAMIC MODAL ENGINE
 */
window.openProjectDetails = async () => {
    const projectId = localStorage.getItem('selected_project_id');
    if (!projectId) return alert("No project selected.");

    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error) return console.error("Fetch Error:", error);

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'dynamic-project-modal';
    modalOverlay.className = 'fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';
    
    const allowedRoles = ['admin', 'owner', 'project_manager'];
    const canEdit = allowedRoles.includes(window.currentSession?.role?.toLowerCase());

    modalOverlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 class="text-lg font-black text-gray-900 uppercase tracking-tight">Project Details</h2>
                <button onclick="document.getElementById('dynamic-project-modal').remove()" class="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Project Title</label>
                    <input id="edit-project-title" type="text" value="${project.title}" ${!canEdit ? 'disabled' : ''} 
                           class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50">
                </div>
                <div>
                    <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</label>
                    <select id="edit-project-status" ${!canEdit ? 'disabled' : ''} 
                            class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-50">
                        <option value="Active" ${project.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option value="On Hold" ${project.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
                        <option value="Cancelled" ${project.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        <option value="Complete" ${project.status === 'Complete' ? 'selected' : ''}>Complete</option>
                    </select>
                </div>
                <div class="pt-4 flex gap-3">
                    <button onclick="document.getElementById('dynamic-project-modal').remove()" 
                            class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                    ${canEdit ? `
                        <button onclick="window.saveProjectDetails('${project.id}')" 
                                class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-shadow shadow-md">Save Changes</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
};

window.saveProjectDetails = async (id) => {
    const title = document.getElementById('edit-project-title').value;
    const status = document.getElementById('edit-project-status').value;

    const { error } = await supabase
        .from('projects')
        .update({ title, status })
        .eq('id', id);

    if (error) {
        alert("Update failed: " + error.message);
    } else {
        document.getElementById('dynamic-project-modal').remove();
        location.reload();
    }
};

window.archiveProject = async () => {
    const projectId = localStorage.getItem('selected_project_id');
    if (!confirm("Are you sure you want to archive this project?")) return;

    const { error } = await supabase
        .from('projects')
        .update({ status: 'Archived' })
        .eq('id', projectId);

    if (error) alert(error.message);
    else window.location.href = 'index.html';
};

export { rollupToRequirement, syncHierarchyStatus };