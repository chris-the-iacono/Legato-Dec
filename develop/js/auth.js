// js/auth.js
import { supabase } from './config.js';

/**
 * Handles the Sign-In process
 * @param {Event} e - The form submission event
 */
export async function handleSignIn(e) {
    // 1. STOP THE REFRESH: This prevents the browser from reloading the page
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDisplay = document.getElementById('error-message');

    try {
        // 2. SUPABASE AUTH: Attempt to sign in
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // 3. SUCCESS: Redirect to the main dashboard
        // Note: Using './index.html' ensures it stays in the current environment folder
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
        // Redirect back to login page
        window.location.href = 'auth.html';
    }
}

/**
 * Check Access: Verifies if a user is logged in before showing page content
 * Returns the session and user metadata
 */
export async function checkAccess() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        window.location.href = 'auth.html';
        return null;
    }

    // Return the user data and any custom claims (like tenant name or modules)
    return {
        user: session.user,
        fullName: session.user.user_metadata.full_name || "User",
        tenantName: session.user.user_metadata.tenant_name || "Organization",
        modules: session.user.user_metadata.modules || {
            module_requirements: true,
            module_risks: true,
            module_issues: true,
            module_changes: true
        }
    };
}