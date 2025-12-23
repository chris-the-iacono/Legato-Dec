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
 */
export async function checkAccess() {
    // 1. Check if a basic Auth session exists
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.href = 'auth.html';
        return null;
    }

    // 2. FETCH DATABASE PROFILE: Get the linked Tenant and Role
    // This connects user_profiles to the tenants table using the foreign key
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select(`
            role,
            tenant_id,
            full_name,
            tenants (
                name,
                module_requirements,
                module_risks,
                module_issues,
                module_changes
            )
        `)
        .eq('user_id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error("Profile Link Error:", profileError);
        // If profile doesn't exist, we can't determine the tenant
        return null;
    }

    // 3. RETURN UNIFIED SESSION OBJECT
    return {
        user: session.user,
        fullName: profile.full_name || "User",
        role: profile.role || 'user',
        tenantId: profile.tenant_id, // THIS IS THE KEY FOR YOUR 409 ERROR
        tenantName: profile.tenants?.name || "Organization",
        modules: {
            module_requirements: profile.tenants?.module_requirements ?? true,
            module_risks: profile.tenants?.module_risks ?? true,
            module_issues: profile.tenants?.module_issues ?? true,
            module_changes: profile.tenants?.module_changes ?? true
        }
    };
}