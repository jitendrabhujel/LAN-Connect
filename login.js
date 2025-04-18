$(document).ready(function() {
    const loginForm = $('#login-form');
    const usernameInput = $('#username');
    const passwordInput = $('#password');
    const errorDisplay = $('#error-message');

    function showAlert(type, message, isDismissible = true) {
        let alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
        let alertHtml = `
            <div class="alert ${alertClass} alert-dismissible fade show" role="alert" 
                 style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; min-width: 300px; 
                        background-color: #fff; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-radius: 8px;">
                <div style="display: flex; align-items: start; justify-content: space-between; gap: 10px;">
                    <div>
                        ${type === 'error' ? '❌' : '✅'} 
                        <span style="margin-left: 8px;">${message}</span>
                    </div>
                    <button type="button" class="close" style="font-size: 1.5rem; font-weight: 700; line-height: 1; 
                            color: #000; text-shadow: 0 1px 0 #fff; opacity: .5; background: none; border: none; 
                            padding: 0; cursor: pointer;" onclick="this.parentElement.parentElement.remove();">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
            </div>`;

        // Remove any existing alerts
        $('.alert').remove();
        
        // Add new alert to body
        $('body').append(alertHtml);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            $('.alert').fadeOut(300, function() { $(this).remove(); });
        }, 5000);
    }

    function showError(message) {
        showAlert('error', ValidationUtils.sanitizeInput(message));
    }

    function hideError() {
        $('.alert').remove();
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

    loginForm.on('submit', function(e) {
        e.preventDefault();
        hideError();

        const username = ValidationUtils.sanitizeInput(usernameInput.val().trim());
        const password = passwordInput.val(); // Don't sanitize password before sending

        // Validate inputs
        if (!username) {
            showError(ValidationUtils.getValidationMessage('username', 'required'));
            return;
        }

        if (!password) {
            showError(ValidationUtils.getValidationMessage('password', 'required'));
            return;
        }

        if (!ValidationUtils.isValidUsername(username)) {
            showError(ValidationUtils.getValidationMessage('username', 'invalid'));
            return;
        }

        // Send login request
        $.ajax({
            url: '/login/',
            method: 'POST',
            data: {
                username: username,
                password: password
            },
            headers: {
                'X-CSRFToken': ValidationUtils.getCsrfToken()
            },
            success: function(response) {
                if (response.success) {
                    showAlert('success', 'Logged in successfully!');
                    setTimeout(() => {
                        window.location.href = response.redirect_url || '/';
                    }, 1500);
                } else {
                    showError(response.error || 'Login failed. Please try again.');
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