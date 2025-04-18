$(document).ready(function() {
    const signupForm = $('#signup-form');
    const usernameInput = $('#username');
    const emailInput = $('#email');
    const passwordInput = $('#password');
    const confirmPasswordInput = $('#confirm-password');
    const errorDisplay = $('#error-message');

    function showError(message) {
        errorDisplay.html(ValidationUtils.sanitizeInput(message)).removeClass('d-none');
    }

    function hideError() {
        errorDisplay.addClass('d-none').html('');
    }

    // Real-time validation
    usernameInput.on('input', function() {
        const username = $(this).val().trim();
        if (username && !ValidationUtils.isValidUsername(username)) {
            $(this).addClass('is-invalid');
            showError(ValidationUtils.getValidationMessage('username', 'invalid'));
        } else {
            $(this).removeClass('is-invalid');
            hideError();
        }
    });

    emailInput.on('input', function() {
        const email = $(this).val().trim();
        if (email && !ValidationUtils.isValidEmail(email)) {
            $(this).addClass('is-invalid');
            showError(ValidationUtils.getValidationMessage('email', 'invalid'));
        } else {
            $(this).removeClass('is-invalid');
            hideError();
        }
    });

    passwordInput.on('input', function() {
        const password = $(this).val();
        if (password && !ValidationUtils.isStrongPassword(password)) {
            $(this).addClass('is-invalid');
            showError(ValidationUtils.getValidationMessage('password', 'weak'));
        } else {
            $(this).removeClass('is-invalid');
            hideError();
        }
    });

    confirmPasswordInput.on('input', function() {
        const confirmPassword = $(this).val();
        const password = passwordInput.val();
        if (confirmPassword && confirmPassword !== password) {
            $(this).addClass('is-invalid');
            showError(ValidationUtils.getValidationMessage('password', 'mismatch'));
        } else {
            $(this).removeClass('is-invalid');
            hideError();
        }
    });

    signupForm.on('submit', function(e) {
        e.preventDefault();
        hideError();

        const username = ValidationUtils.sanitizeInput(usernameInput.val().trim());
        const email = ValidationUtils.sanitizeInput(emailInput.val().trim());
        const password = passwordInput.val(); // Don't sanitize password
        const confirmPassword = confirmPasswordInput.val(); // Don't sanitize password

        // Validate all inputs
        if (!username || !email || !password || !confirmPassword) {
            showError('All fields are required');
            return;
        }

        if (!ValidationUtils.isValidUsername(username)) {
            showError(ValidationUtils.getValidationMessage('username', 'invalid'));
            return;
        }

        if (!ValidationUtils.isValidEmail(email)) {
            showError(ValidationUtils.getValidationMessage('email', 'invalid'));
            return;
        }

        if (!ValidationUtils.isStrongPassword(password)) {
            showError(ValidationUtils.getValidationMessage('password', 'weak'));
            return;
        }

        if (password !== confirmPassword) {
            showError(ValidationUtils.getValidationMessage('password', 'mismatch'));
            return;
        }

        // Send signup request
        $.ajax({
            url: '/signup/',
            method: 'POST',
            data: {
                username: username,
                email: email,
                password: password,
                confirm_password: confirmPassword
            },
            headers: {
                'X-CSRFToken': ValidationUtils.getCsrfToken()
            },
            success: function(response) {
                if (response.success) {
                    window.location.href = response.redirect_url || '/login/';
                } else {
                    showError(ValidationUtils.sanitizeInput(response.error || 'Signup failed. Please try again.'));
                }
            },
            error: function() {
                showError('An error occurred. Please try again later.');
            }
        });
    });

    // Clear error on input focus
    $('input').on('focus', function() {
        hideError();
        $(this).removeClass('is-invalid');
    });
}); 