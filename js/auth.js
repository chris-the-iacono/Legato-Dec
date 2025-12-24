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
 * Fixed: Uses two-step fetch to avoid 400 Join errors and 42703 Column errors
 */
export async function checkAccess() {
    // 1. Check if a basic Auth session exists
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.href = 'auth.html';
        return null;
    }

    // 2. STEP 1: Fetch Profile 
    // We select only columns we know exist. 
    // If 'full_name' gives an error, remove it from the select string below.
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, tenant_id, full_name') 
        .eq('user_id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error("Profile Fetch Error:", profileError);
        // We return null here because without a profile, we don't know the tenant_id
        return null;
    }

    // 3. STEP 2: Fetch Tenant data separately
    // This bypasses the need for a database "Foreign Key" relationship for the Join to work
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
        modules: {
            module_requirements: tenant?.module_requirements ?? true,
            module_risks: tenant?.module_risks ?? true,
            module_issues: tenant?.module_issues ?? true,
            module_changes: tenant?.module_changes ?? true
        }
    };
}