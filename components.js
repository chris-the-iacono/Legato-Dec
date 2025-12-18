// js/components.js import { handleSignOut } from './auth.js'; 

/** 

Renders the Tabbed UI Header for a selected project. 

@param {Object} session - The session object from checkAccess() 

@param {string} activeTab - The ID of the currently active tab 

@param {string} projectName - The name of the currently selected project 

*/ export function renderProjectHeader(session, activeTab, projectName = "Select Project") { const headerElement = document.getElementById('main-header'); if (!headerElement) return; 

// Define tabs in your specific workflow order 
const allTabs = [ 
   { id: 'requirements', name: 'Requirements & Estimates', link: 'requirements.html', enabled: session.modules.module_requirements }, 
   { id: 'risks', name: 'Risks', link: 'risks.html', enabled: session.modules.module_risks }, 
   { id: 'issues', name: 'Issues', link: 'issues.html', enabled: session.modules.module_issues }, 
   { id: 'changes', name: 'Changes', link: 'changes.html', enabled: session.modules.module_changes } 
]; 
 
// Filter by what this specific tenant has purchased 
const visibleTabs = allTabs.filter(tab => tab.enabled); 
 
headerElement.innerHTML = ` 
   <header class="bg-white border-b border-gray-200 sticky top-0 z-50"> 
       <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-12 border-b border-gray-100"> 
           <div class="flex items-center space-x-4"> 
               <span class="text-xs font-bold text-indigo-600 uppercase tracking-widest">${session.tenantName || 'Project Workspace'}</span> 
               <span class="text-gray-300">|</span> 
               <span class="text-sm font-medium text-gray-700">${projectName}</span> 
           </div> 
           <div class="flex items-center space-x-4"> 
               <span class="text-xs text-gray-500 italic">User: ${session.fullName}</span> 
               <button id="global-signout" class="text-xs text-red-500 hover:underline">Sign Out</button> 
           </div> 
       </div> 
 
       <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"> 
           <nav class="-mb-px flex space-x-8" aria-label="Tabs"> 
               ${visibleTabs.map(tab => ` 
                   <a href="${tab.link}"  
                      class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all 
                      ${activeTab === tab.id  
                          ? 'border-indigo-500 text-indigo-600'  
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"> 
                       ${tab.name} 
                   </a> 
               `).join('')} 
           </nav> 
       </div> 
   </header> 
`; 
 
// Attach sign-out listener 
document.getElementById('global-signout').addEventListener('click', handleSignOut); 
 

} 