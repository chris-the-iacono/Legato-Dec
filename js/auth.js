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
 * Correction: Maps database 'tenant_name' to session property.
 */
export async function checkAccess() {
    // 1. Check if a basic Auth session exists
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.href = 'auth.html';
        return null;
    }

    // 2. STEP 1: Fetch Profile 
    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, tenant_id, full_name, hourly_cost') 
        .eq('user_id', session.user.id)
        .maybeSingle(); 

    if (profileError || !profile) {
        console.warn("Profile missing for authenticated user. Providing fallback session.");
        return {
            user: session.user,
            fullName: session.user.email,
            role: 'Guest',
            tenantId: null,
            tenantName: 'Guest',
            hourlyRate: 0,
            modules: {
                module_requirements: false,
                module_risks: false,
                module_issues: false,
                module_changes: false
            }
        };
    }

    // 3. STEP 2: Fetch Tenant data
    // FIX: Specifically selecting tenant_name column
    const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('tenant_name, module_requirements, module_risks, module_issues, module_changes')
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle();
		
	// DEBUG LOG
	console.log("Profile Tenant ID:", profile.tenant_id);
	console.log("Tenant Table Result:", tenant);

    if (tenantError) {
        console.warn("Tenant Fetch Warning:", tenantError);
    }

    // 4. RETURN UNIFIED SESSION OBJECT
    return {
        user: session.user,
        fullName: profile.full_name || session.user.email.split('@')[0], 
        role: profile.role || 'Member',
        tenantId: profile.tenant_id,
        // FIX: Mapping database column 'tenant_name' to 'tenantName'
        tenantName: tenant?.tenant_name || "Project", 
        hourlyRate: profile.hourly_cost || 0,
        modules: {
            module_requirements: tenant?.module_requirements ?? true,
            module_risks: tenant?.module_risks ?? true,
            module_issues: tenant?.module_issues ?? true,
            module_changes: tenant?.module_changes ?? true
        }
    };
}