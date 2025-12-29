// js/config.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cleaned actual values
export const SUPABASE_URL = 'https://xkwctrfmvpqpcrksrzgq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhrd2N0cmZtdnBxcGNya3NyemdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTk0MTAsImV4cCI6MjA3OTI5NTQxMH0.i6GMjG1_APaiKc3UcJekxtFtAbPrykEkwSZUnusNvmY';

// Create the connection
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Define Module Constants
export const MODULES = {
    REQUIREMENTS: 'module_requirements',
    ESTIMATING: 'module_estimating',
    RISKS: 'module_risks',
    ISSUES: 'module_issues',
    CHANGES: 'module_changes'
};