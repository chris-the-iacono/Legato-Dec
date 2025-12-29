// js/config.js 

import { createClient } from 'https://unpkg.com/@supabase/supabase-js@2'; 

 // Replace these with your actual Supabase project values 

export const SUPABASE_URL = 'https://your-project-url.supabase.co'; 

export const SUPABASE_ANON_KEY = 'your-anon-key'; 

 export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 

 // Define Module Constants to match your Subscriptions table 

export const MODULES = { 

    REQUIREMENTS: 'module_requirements', 

    ESTIMATING: 'module_estimating', 

    RISKS: 'module_risks', 

    ISSUES: 'module_issues', 

    CHANGES: 'module_changes' 

}; 