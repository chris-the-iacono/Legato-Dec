// js/auth.js
import { supabase } from './config.js';

/**
 * Handles the Sign-In process
 */
export async function handleSignIn(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDisplay = document.getElementById('error-message');

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;
        window.location.href = 'index.html';

    } catch (error) {
        console.error('Login error:', error.message);
        if (errorDisplay) {
            errorDisplay.textContent = "Invalid login credentials. Please try again.";
            errorDisplay.classList.remove('hidden');
        }
    }
}

/**
 * Handles Sign-Out
 */
export async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error signing out:', error.message);
    } else {
        window.location.href = 'auth.html';
    }
}

/**
 * Check Access: Verifies session and fetches Tenant/Profile data
 * Fixed: Uses two-step fetch and maps 'hourly_cost' to 'hourlyRate'
 */
export async function checkAccess() {
    // 1. Check if a basic Auth session exists
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.href = 'auth.html';
        return null;
    }

    // 2. STEP 1: Fetch Profile 
    // Uses 'hourly_cost' to match your database column name
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, tenant_id, full_name, hourly_cost') 
        .eq('user_id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error("Profile Fetch Error (Check if columns exist):", profileError);
        return null;
    }

    // 3. STEP 2: Fetch Tenant data separately
    // This bypasses the need for a complex database JOIN
    const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .single();

    if (tenantError) {
        console.warn("Tenant Fetch Warning:", tenantError);
    }

    // 4. RETURN UNIFIED SESSION OBJECT
    return {
        user: session.user,
        fullName: profile.full_name || "User",
        role: profile.role || 'user',
        tenantId: profile.tenant_id,
        tenantName: tenant?.name || "Organization",
        // Mapping database 'hourly_cost' to frontend 'hourlyRate'
        hourlyRate: profile.hourly_cost || 0,
        modules: {
            module_requirements: tenant?.module_requirements ?? true,
            module_risks: tenant?.module_risks ?? true,
            module_issues: tenant?.module_issues ?? true,
            module_changes: tenant?.module_changes ?? true
        }
    };
}