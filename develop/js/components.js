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

    const backDestination = (isWindshield) ? 'index.html' : 'windshield.html';

    // 4. DEFINE TABS (Filtered by purchased modules)
    const allTabs = [
        { id: 'requirements', name: 'Requirements & Estimates', link: 'requirements.html', enabled: session.modules.module_requirements },
        { id: 'risks', name: 'Risks', link: 'risks.html', enabled: session.modules.module_risks },
        { id: 'issues', name: 'Issues', link: 'issues.html', enabled: session.modules.module_issues },
        { id: 'changes', name: 'Changes', link: 'changes.html', enabled: session.modules.module_changes }
    ];

    const visibleTabs = allTabs.filter(tab => tab.enabled);

    // 5. SMART TENANT LABEL LOGIC
    // Prevents "Workspace Workspace" and handles the "Project" fallback
    const rawName = session.tenantName || 'Project';
    const cleanTenantLabel = rawName.toLowerCase().includes('workspace') 
        ? rawName 
        : `${rawName} Workspace`;

    // 6. RENDER THE HTML
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
                            ${cleanTenantLabel} ${envBadge}
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
                    
                    <button id="global-signout" class="text-xs font-bold text-gray-400 hover:text-