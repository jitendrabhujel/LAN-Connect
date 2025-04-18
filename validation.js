// Input validation and sanitization utilities
const ValidationUtils = {
    // Email validation
    isValidEmail: function(email) {
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
        return emailRegex.test(email);
    },

    // Username validation
    isValidUsername: function(username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        return usernameRegex.test(username);
    },

    // Password strength validation
    isStrongPassword: function(password) {
        // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return passwordRegex.test(password);
    },

    // Input sanitization
    sanitizeInput: function(input) {
        if (!input) return '';
        return input.replace(/[<>]/g, match => match === '<' ? '&lt;' : '&gt;')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#x27;')
                    .replace(/\//g, '&#x2F;');
    },

    // CSRF token getter
    getCsrfToken: function() {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, 'csrftoken'.length + 1) === ('csrftoken' + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring('csrftoken'.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    },

    // Form validation messages
    getValidationMessage: function(type, value) {
        const messages = {
            email: {
                invalid: 'Please enter a valid email address',
                required: 'Email is required'
            },
            username: {
                invalid: 'Username must be 3-30 characters long and can only contain letters, numbers, and underscores',
                required: 'Username is required'
            },
            password: {
                weak: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character',
                required: 'Password is required',
                mismatch: 'Passwords do not match'
            }
        };
        return messages[type][value] || 'Invalid input';
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationUtils;
} 