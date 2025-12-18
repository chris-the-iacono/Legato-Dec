// js/components.js
import { handleSignOut } from './auth.js';

/**
* Updated file
 * Renders the Tabbed UI Header for a selected project.
 * @param {Object} session - The session object from checkAccess()
 * @param {string} activeTab - The ID of the currently active tab
 * @param {string} projectName - The name of the currently selected project
 */
export function renderProjectHeader(session, activeTab, projectName = "Select Project") {
    const headerElement = document.getElementById('main-header');
    
    // Safety check: if the HTML doesn't have <div id="main-header"></div>, stop.
    if (!headerElement) return;

    // 1. DYNAMIC TAB TITLE: Updates the browser tab name automatically
    document.title = `${projectName} | ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;

    // 2. ENVIRONMENT BADGE: Shows if we are in Dev or Test based on URL
    const currentPath = window.location.pathname;
    let envBadge = '';
    if (currentPath.includes('/develop/')) {
        envBadge = '<span class="bg-yellow-500 text-black px-2 py-0.5 text-[10px] font-bold rounded ml-2 shadow-sm">DEV</span>';
    } else if (currentPath.includes('/test/')) {
        envBadge = '<span class="bg-blue-500 text-white px-2 py-0.5 text-[10px] font-bold rounded ml-2 shadow-sm">STAGE</span>';
    }

    // 3. DEFINE TABS: Filtered by what the Tenant has actually purchased
    const allTabs = [
        { id: 'requirements', name: 'Requirements & Estimates', link: 'requirements.html', enabled: session.modules.module_requirements },
        { id: 'risks', name: 'Risks', link: 'risks.html', enabled: session.modules.module_risks },
        { id: 'issues', name: 'Issues', link: 'issues.html', enabled: session.modules.module_issues },
        { id: 'changes', name: 'Changes', link: 'changes.html', enabled: session.modules.module_changes }
    ];

    const visibleTabs = allTabs.filter(tab => tab.enabled);

    // 4. RENDER THE HTML
    headerElement.innerHTML = `
        <header class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
            <div class="max-w-7xl mx-auto px-4 flex justify-between items-center h-12 border-b border-gray-100">
                <div class="flex items-center space-x-4">
                    <span class="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center">
                        ${session.tenantName || 'Project Workspace'} ${envBadge}
                    </span>
                    <span class="text-gray-300">|</span>
                    <span class="text-sm font-semibold text-gray-800">${projectName}</span>
                </div>
                <div class="flex items-center space-x-6">
                    <span class="text-xs text-gray-500 font-medium">
                        <span class="hidden sm:inline">Logged in as:</span> ${session.fullName}
                    </span>
                    <button id="global-signout" class="text-xs font-bold text-red-600 hover:text-red-800 transition">
                        Sign Out
                    </button>
                </div>
            </div>

            <div class="max-w-7xl mx-auto px-4">
                <nav class="-mb-px flex space-x-8 overflow-x-auto">
                    ${visibleTabs.map(tab => `
                        <a href="${tab.link}" 
                           class="whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm transition-all duration-200
                           ${activeTab === tab.id 
                               ? 'border-indigo-500 text-indigo-600' 
                               : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'}">
                            ${tab.name}
                        </a>
                    `).join('')}
                </nav>
            </div>
        </header>
    `;

    // 5. ATTACH EVENTS
    document.getElementById('global-signout').addEventListener('click', (e) => {
        e.preventDefault();
        handleSignOut();
    });
}