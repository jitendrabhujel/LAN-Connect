// home.js
let input_message = $('#input-message');
let send_message_form = $('#send-message-form');
const USER_ID = $('#logged-in-user').val();
let active_thread_id = '';
let active_user_id = null;
let fileInput = $('#file-input');
let messageWrapper = $('#message-wrapper');

// Group Chat Variables
let isGroupChat = false;
let currentGroupId = null;
let groupMembers = new Set();

const SUPPORTED_FILE_TYPES = {
    'Images': '.jpg, .jpeg, .png, .gif, .webp, .bmp, .tiff, .svg, .ico, .heic',
    'Videos': '.mp4, .webm, .ogg',
    'Documents': '.pdf, .doc, .docx, .xls, .xlsx'
};

function sanitizeInput(input) {
    if (!input) return '';
    return input.replace(/[<>]/g, match => match === '<' ? '&lt;' : '&gt;')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
}

$(document).ready(function() {
    console.log('DOM ready, checking contacts');
    let firstUser = $('.contact-li').first();
    if (firstUser.length) {
        console.log('First user found, triggering click');
        firstUser.click();
    } else {
        console.log('No contact-li elements found');
    }

    let loc = window.location;
    let wsStart = 'ws://';
    if (loc.protocol === 'https') {
        wsStart = 'wss://';
    }
    let endpoint = wsStart + loc.host + '/home/';
    let uploadUrl = loc.protocol + '//' + loc.host + '/upload/';

    var socket = new WebSocket(endpoint);

    socket.onopen = function(e) {
        console.log('WebSocket open', e);
    };

    socket.onmessage = function(e) {
        console.log('Message received:', e);
        try {
            let data = JSON.parse(e.data);
            console.log('Parsed data:', data);

            let message = data.message;
            let sent_by_id = data.sent_by;
            let send_to_id = data.send_to;
            let thread_id = data.thread_id || '';
            let attachment_urls = data.attachment_urls || [];
            let attachment_names = data.attachment_names || {};

            if (sent_by_id === USER_ID) {
                if (!messageWrapper.find(`.msg_cotainer_send:contains("${message}"):last`).length) {
                    newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
                }
            } else if (sent_by_id === active_user_id && send_to_id === USER_ID) {
                newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
            } else if (sent_by_id !== USER_ID) {
                let senderThread = $(`.contact-li[user-id="${sent_by_id}"]`);
                if (senderThread.length) {
                    let previewText = message || 'New attachment';
                    if (previewText.length > 30) {
                        previewText = previewText.substring(0, 30) + '...';
                    }
                    senderThread.find('.user_info p').html(`<strong>New message: ${previewText}</strong>`);
                }
            }
        } catch (err) {
            console.error('Failed to parse message:', err);
        }
    };

    socket.onerror = function(e) {
        console.log('WebSocket error', e);
    };

    socket.onclose = function(e) {
        console.log('WebSocket closed', e);
    };

    $('.contact-li').on('click', function() {
        $('.contact-li').removeClass('active');
        $(this).addClass('active');

        if ($(this).hasClass('group-chat')) {
            isGroupChat = true;
            currentGroupId = $(this).attr('group-id');
            groupMembers = new Set(JSON.parse($(this).attr('data-members')));

            let groupName = $(this).find('.user_info span').text();
            messageWrapper.attr('group-id', currentGroupId);
            messageWrapper.find('.user_info span').text(groupName);
            messageWrapper.find('.user_info p').text(`${groupMembers.size} members`);

            fetch_group_chat_history(currentGroupId);
        } else {
            isGroupChat = false;
            currentGroupId = null;
            active_user_id = $(this).attr('user-id');

            let username = $(this).find('.user_info span').text();
            messageWrapper.removeAttr('group-id');
            messageWrapper.attr('other-user-id', active_user_id);
            messageWrapper.find('.user_info span').text(username);

            // Remove "New message" notification when user is clicked
            $(this).find('.user_info p').removeClass('notification');
            
            // Get the last message from the data attribute if it exists
            let lastMessage = $(this).attr('data-last-message');
            if (lastMessage) {
                $(this).find('.user_info p').text(lastMessage);
            }

            fetch_chat_history(active_user_id);
        }
    });

    send_message_form.on('submit', function(e) {
        e.preventDefault();
        let message = sanitizeInput(input_message.val().trim());
        let files = fileInput[0].files;

        if (!active_user_id && !currentGroupId) {
            showAlert('error', 'Please select a chat to send a message');
            return;
        }

        let formData = new FormData();
        formData.append('sent_by', USER_ID);
        if (isGroupChat) {
            formData.append('group_id', currentGroupId);
            formData.append('is_group_message', true);
        } else {
            formData.append('send_to', active_user_id);
            formData.append('is_group_message', false);
        }
        if (message) formData.append('message', message);
        for (let i = 0; i < files.length; i++) {
            if (!validateFile(files[i])) {
                return;
            }
            formData.append('files', files[i]);
        }

        if (files.length > 0) {
            $.ajax({
                url: uploadUrl,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function(response) {
                    let attachment_urls = response.attachment_urls;
                    let attachment_names = response.attachment_names || {};
                    sendMessage(message, attachment_urls, attachment_names);
                },
                error: function(xhr, status, error) {
                    console.error('File upload failed:', error);
                }
            });
        } else {
            sendMessage(message, [], {});
        }
    });

    function showSupportedFileTypes() {
        let alertHtml = `
            <div class="alert alert-info alert-dismissible fade show" role="alert" style="position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1050; min-width: 300px;">
                <strong>Supported File Types:</strong><br>
                <small>
                    Images: ${SUPPORTED_FILE_TYPES.Images}<br>
                    Videos: ${SUPPORTED_FILE_TYPES.Videos}<br>
                    Documents: ${SUPPORTED_FILE_TYPES.Documents}<br>
                    Max size: 50MB
                </small>
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>`;
        
        // Remove any existing alerts
        $('.alert').alert('close');
        
        // Add new alert
        $('body').append(alertHtml);
    }

    function validateFile(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        
        if (file.size > maxSize) {
            showSupportedFileTypes();
            return false;
        }

        const fileName = file.name.toLowerCase();
        const fileExt = '.' + fileName.split('.').pop();

        // Check if file extension is in any of the supported types
        const isSupported = Object.values(SUPPORTED_FILE_TYPES).some(types => 
            types.split(',').map(t => t.trim().toLowerCase()).includes(fileExt)
        );

        if (!isSupported) {
            showSupportedFileTypes();
            return false;
        }

        return true;
    }

    function sendMessage(message, attachment_urls = [], attachment_names = {}) {
        if (!active_user_id && !currentGroupId) {
            alert('Please select a chat to send a message');
            return;
        }

        let messageData = {
            'message': message,
            'sent_by': USER_ID,
            'attachment_urls': attachment_urls,
            'attachment_names': attachment_names
        };

        if (isGroupChat) {
            messageData.is_group_message = true;
            messageData.group_id = currentGroupId;
        } else {
            messageData.is_group_message = false;
            messageData.send_to = active_user_id;
        }

        // Display message immediately
        newMessage(message, USER_ID, active_thread_id, attachment_urls, attachment_names);

        // Send the message through WebSocket
        socket.send(JSON.stringify(messageData));

        // Clear the input fields
        input_message.val('');
        fileInput.val('');
    }

    function handleChatMessage(data) {
        let message = data.message;
        let sent_by_id = data.sent_by;
        let send_to_id = data.send_to;
        let thread_id = data.thread_id;
        let attachment_urls = data.attachment_urls || [];
        let timestamp = data.timestamp;

        // Update active thread ID if not set
        if (!active_thread_id && thread_id) {
            active_thread_id = thread_id;
        }

        // Handle message display
        if (sent_by_id === USER_ID) {
            // Message sent by current user
            if (send_to_id === active_user_id) {
                newMessage(message, sent_by_id, thread_id, attachment_urls, timestamp);
            }
        } else if (send_to_id === USER_ID) {
            // Message received from another user
            if (sent_by_id === active_user_id) {
                newMessage(message, sent_by_id, thread_id, attachment_urls, timestamp);
            } else {
                updateMessagePreview(sent_by_id, message);
            }
        }
    }

    function updateMessagePreview(userId, message) {
        let userThread = $(`.contact-li[user-id="${userId}"]`);
        if (userThread.length) {
            let previewText = message || 'New attachment';
            if (previewText.length > 30) {
                previewText = previewText.substring(0, 30) + '...';
            }
            
            // Store the original message as a data attribute
            userThread.attr('data-last-message', previewText);
            
            // If this is not the active chat, show "New message" notification
            if (active_user_id !== userId) {
                userThread.find('.user_info p')
                    .html(`<strong>New message: ${previewText}</strong>`)
                    .addClass('notification');
            } else {
                // If this is the active chat, just update the preview
                userThread.find('.user_info p').text(previewText);
            }
        }
    }

    function newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names) {
        if (!message && (!attachment_urls || !attachment_urls.length)) return;

        message = sanitizeInput(message);
        let currentTime = new Date().toLocaleString();

        // Function to fix URL construction
        function getProperUrl(url) {
            if (!url) return '';
            // Remove any duplicate media prefixes
            url = url.replace(/\/media\/media\//g, '/media/');
            // If it's already an absolute URL, return as is
            if (url.startsWith('http')) return url;
            // If it starts with /media/, prepend with origin
            if (url.startsWith('/media/')) return window.location.origin + url;
            // Otherwise, construct the full media URL
            return window.location.origin + '/media/' + url;
        }

        if (sent_by_id === USER_ID) {
            message_element = `
                <div class="d-flex justify-content-end mb-4 replied">
                    <div class="msg_cotainer_send">
                        ${message ? `<div class="message-text mb-2">${message}</div>` : ''}
                        ${attachment_urls && attachment_urls.map(url => {
                            const fullUrl = getProperUrl(url);
                            const fileExt = url.split('.').pop().toLowerCase();
                            const originalName = attachment_names[url] || url.split('/').pop();
                            
                            // Handle images
                            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico', 'heic', 'heif'].includes(fileExt)) {
                                return `<div class="message-attachment mb-2">
                                    <img src="${fullUrl}" alt="${originalName}" style="max-width: 300px; max-height: 400px; border-radius: 8px; cursor: pointer; object-fit: contain;" 
                                        onclick="window.open('${fullUrl}', '_blank')">
                                </div>`;
                            }
                            
                            // Handle PDFs and documents
                            else if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(fileExt)) {
                                const fileIcon = fileExt === 'pdf' ? '📄' : 
                                                ['doc', 'docx'].includes(fileExt) ? '📝' : '📊';
                                return `<div class="message-attachment file-attachment mb-2" style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 24px;">${fileIcon}</span>
                                    <a href="${fullUrl}" target="_blank" class="file-download" style="color: inherit; text-decoration: none; word-break: break-word;">
                                        ${originalName}
                                    </a>
                                </div>`;
                            }
                            
                            // Handle videos
                            else if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
                                return `<div class="message-attachment mb-2">
                                    <video controls style="max-width: 300px; border-radius: 8px;" preload="metadata">
                                        <source src="${fullUrl}" type="video/${fileExt}">
                                        Your browser does not support the video tag.
                                    </video>
                                </div>`;
                            }
                            
                            // Handle other files
                            else {
                                return `<div class="message-attachment file-attachment mb-2" style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 24px;">📎</span>
                                    <a href="${fullUrl}" target="_blank" class="file-download" style="color: inherit; text-decoration: none; word-break: break-word;">
                                        ${originalName}
                                    </a>
                                </div>`;
                            }
                        }).join('')}
                        <span class="msg_time" style="font-size: 0.75em; opacity: 0.7;">${currentTime}</span>
                    </div>
                </div>`;
        } else {
            message_element = `
                <div class="d-flex justify-content-start mb-4 received">
                    <div class="msg_cotainer">
                        ${message ? `<div class="message-text mb-2">${message}</div>` : ''}
                        ${attachment_urls && attachment_urls.map(url => {
                            const fullUrl = getProperUrl(url);
                            const fileExt = url.split('.').pop().toLowerCase();
                            const originalName = attachment_names[url] || url.split('/').pop();
                            
                            // Handle images
                            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico', 'heic', 'heif'].includes(fileExt)) {
                                return `<div class="message-attachment mb-2">
                                    <img src="${fullUrl}" alt="${originalName}" style="max-width: 300px; max-height: 400px; border-radius: 8px; cursor: pointer; object-fit: contain;" 
                                        onclick="window.open('${fullUrl}', '_blank')">
                                </div>`;
                            }
                            
                            // Handle PDFs and documents
                            else if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(fileExt)) {
                                const fileIcon = fileExt === 'pdf' ? '📄' : 
                                                ['doc', 'docx'].includes(fileExt) ? '📝' : '📊';
                                return `<div class="message-attachment file-attachment mb-2" style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 24px;">${fileIcon}</span>
                                    <a href="${fullUrl}" target="_blank" class="file-download" style="color: inherit; text-decoration: none; word-break: break-word;">
                                        ${originalName}
                                    </a>
                                </div>`;
                            }
                            
                            // Handle videos
                            else if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
                                return `<div class="message-attachment mb-2">
                                    <video controls style="max-width: 300px; border-radius: 8px;" preload="metadata">
                                        <source src="${fullUrl}" type="video/${fileExt}">
                                        Your browser does not support the video tag.
                                    </video>
                                </div>`;
                            }
                            
                            // Handle other files
                            else {
                                return `<div class="message-attachment file-attachment mb-2" style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 24px;">📎</span>
                                    <a href="${fullUrl}" target="_blank" class="file-download" style="color: inherit; text-decoration: none; word-break: break-word;">
                                        ${originalName}
                                    </a>
                                </div>`;
                            }
                        }).join('')}
                        <span class="msg_time" style="font-size: 0.75em; opacity: 0.7;">${currentTime}</span>
                    </div>
                </div>`;
        }

        let msgBody = messageWrapper.find('.msg_card_body');
        msgBody.append(message_element);
        msgBody.scrollTop(msgBody[0].scrollHeight);
        updateMessageCount();
    }

    function updateMessageCount() {
        let msgBody = messageWrapper.find('.msg_card_body');
        let count = msgBody.find('.received, .replied').length;
        messageWrapper.find('.user_info p').text(count + ' messages');
    }

    function appendMessage(messageData) {
        let { message, sent_by_id, thread_id, attachment_urls, attachment_names, send_to } = messageData;
        thread_id = thread_id || '';
        
        // If we're in the relevant chat, show the message immediately
        if (active_user_id === (sent_by_id === USER_ID ? send_to : sent_by_id)) {
            newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
        } else {
            // Update the message preview for the sender
            let senderId = sent_by_id === USER_ID ? send_to : sent_by_id;
            let userThread = $(`.contact-li[user-id="${senderId}"]`);
            
            if (userThread.length) {
                let previewText = message || 'New attachment';
                if (previewText.length > 30) {
                    previewText = previewText.substring(0, 30) + '...';
                }
                
                // Store the original message
                userThread.attr('data-last-message', previewText);
                
                // Show new message notification
                userThread.find('.user_info p')
                    .html(`<strong>New message: ${previewText}</strong>`)
                    .addClass('notification');
            }
        }
    }

    function fetch_chat_history(other_user_id) {
        // Clear existing messages first
        messageWrapper.find('.msg_card_body').empty();
        
        $.ajax({
            url: '/app1/fetch_chat_history/',
            method: 'GET',
            data: {
                other_user_id: other_user_id,
                current_user_id: USER_ID
            },
            success: function(response) {
                console.log('Chat history fetched:', response);
                if (response.thread_id) {
                    active_thread_id = String(response.thread_id);
                    messageWrapper.attr('chat-id', 'chat_' + active_thread_id);
                }
                if (response.messages && response.messages.length > 0) {
                    response.messages.forEach(function(msg) {
                        let message = msg.message;
                        let sent_by_id = msg.sent_by;
                        let attachment_urls = msg.attachment_urls || [];
                        let attachment_names = msg.attachment_names || {};
                        newMessage(message, sent_by_id, active_thread_id, attachment_urls, attachment_names);
                    });
                    
                    // Store and display the last message in the contact list
                    let lastMsg = response.messages[response.messages.length - 1];
                    let previewText = lastMsg.message || 'Attachment';
                    if (previewText.length > 30) {
                        previewText = previewText.substring(0, 30) + '...';
                    }
                    
                    let userThread = $(`.contact-li[user-id="${other_user_id}"]`);
                    userThread.attr('data-last-message', previewText);
                    userThread.find('.user_info p')
                        .text(previewText)
                        .removeClass('notification');
                    
                    // Scroll to bottom after loading all messages
                    let msgBody = messageWrapper.find('.msg_card_body');
                    msgBody.scrollTop(msgBody[0].scrollHeight);
                }
                
                // Update message count
                updateMessageCount();
            },
            error: function(xhr, status, error) {
                console.error('Failed to fetch chat history:', error);
                messageWrapper.find('.msg_card_body').html(
                    '<div class="text-center text-danger">Failed to load chat history. Please try again.</div>'
                );
            }
        });
    }

    // Add function to fetch group chat history
    function fetch_group_chat_history(groupId) {
        messageWrapper.find('.msg_card_body').empty();
        
        $.ajax({
            url: '/app1/fetch_group_chat_history/',
            method: 'GET',
            data: {
                group_id: groupId
            },
            success: function(response) {
                if (response.messages && response.messages.length > 0) {
                    response.messages.forEach(function(msg) {
                        newMessage(msg.message, msg.sent_by, msg.thread_id, msg.attachment_urls, msg.attachment_names);
                    });
                    
                    let msgBody = messageWrapper.find('.msg_card_body');
                    msgBody.scrollTop(msgBody[0].scrollHeight);
                }
                updateMessageCount();
            },
            error: function(xhr, status, error) {
                console.error('Failed to fetch group chat history:', error);
                messageWrapper.find('.msg_card_body').html(
                    '<div class="text-center text-danger">Failed to load group chat history. Please try again.</div>'
                );
            }
        });
    }

    // Initialize WebSocket reconnection with backoff
    let wsReconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const INITIAL_RECONNECT_DELAY = 1000; // 1 second

    function initWebSocket() {
        let loc = window.location;
        let wsStart = 'ws://';
        if (loc.protocol === 'https') {
            wsStart = 'wss://';
        }
        let endpoint = wsStart + loc.host + '/home/';
        
        socket = new WebSocket(endpoint);
        
        socket.onopen = function(e) {
            console.log('WebSocket connected');
            wsReconnectAttempts = 0;
            
            // Initialize video call functionality after WebSocket is connected
            if (!window.videoCall) {
                window.videoCall = new VideoCall(socket);
            } else {
                window.videoCall.socket = socket;
            }
        };
        
        socket.onclose = function(e) {
            if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 30000);
                console.log(`WebSocket disconnected. Reconnecting in ${delay/1000} seconds... (Attempt ${wsReconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(initWebSocket, delay);
                wsReconnectAttempts++;
            } else {
                console.log('WebSocket reconnection failed after maximum attempts. Please refresh the page.');
                showAlert('error', 'Connection lost. Please refresh the page to reconnect.');
            }
        };
        
        socket.onerror = function(e) {
            console.error('WebSocket error:', e);
        };
        
        socket.onmessage = function(e) {
            try {
                let data = JSON.parse(e.data);
                
                // Handle video call messages
                if (data.type === 'video-call' && window.videoCall) {
                    window.videoCall.handleWebSocketMessage(data);
                    return;
                }
                
                // Handle regular chat messages
                appendMessage(data);
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        };
    }

    // Initialize WebSocket connection
    initWebSocket();

    // Group Creation Button Click Handler
    $('#create-group-btn').on('click', function() {
        loadAvailableMembers();
        $('#createGroupModal').modal('show');
    });

    // Load Available Members for Group Creation
    function loadAvailableMembers() {
        $('.member-selection').empty();
        $('.contact-li:not(.group-chat)').each(function() {
            let userId = $(this).attr('user-id');
            let username = $(this).find('.user_info span').text();
            
            if (userId && userId !== USER_ID) {
                $('.member-selection').append(`
                    <div class="custom-control custom-checkbox mb-2">
                        <input type="checkbox" class="custom-control-input" id="member-${userId}" value="${userId}">
                        <label class="custom-control-label" for="member-${userId}">
                            <div class="d-flex align-items-center">
                                <img src="/static/img/default-avatar.png" class="rounded-circle" width="30" height="30">
                                <span class="ml-2">${sanitizeInput(username)}</span>
                            </div>
                        </label>
                    </div>
                `);
            }
        });
    }

    // Initialize modals
    $(document).ready(function() {
        // Initialize all modals
        $('.modal').modal({
            show: false
        });

        // Close modal handler
        $('.modal .close').on('click', function() {
            $(this).closest('.modal').modal('hide');
        });

        // Reset form on modal close
        $('#createGroupModal').on('hidden.bs.modal', function() {
            $('#groupName').val('');
            $('.member-selection input').prop('checked', false);
        });
    });

    $('#createGroupSubmit').on('click', function() {
        const groupName = $('#groupName').val().trim();
        const groupDescription = $('#group-description').val().trim(); // Ensure there's an input for description
        const selectedMembers = [];
    
        $('.member-selection input:checked').each(function() {
            selectedMembers.push($(this).val());
        });
    
        if (!groupName) {
            showAlert('error', 'Please enter a valid group name');
            return;
        }
    
        if (selectedMembers.length === 0) {
            showAlert('error', 'Please select at least one member');
            return;
        }
    
        // Add current user to the group members if not already included
        if (!selectedMembers.includes(USER_ID)) {
            selectedMembers.push(USER_ID);
        }
    
        // Get CSRF token from cookie
        const csrftoken = getCookie('csrftoken');
    
        // Send group creation request
        $.ajax({
            url: '/app1/create_group/',
            method: 'POST',
            data: {
                name: groupName,
                description: groupDescription, // Include description in the data
                members: JSON.stringify(selectedMembers)
            },
            headers: {
                'X-CSRFToken': csrftoken
            },
            success: function(response) {
                if (response.success) {
                    addGroupToContacts(response.group_id, groupName, selectedMembers);
                    $('#createGroupModal').modal('hide');
                    showAlert('success', 'Group created successfully!');
                    // Clear form
                    $('#groupName').val('');
                    $('.member-selection input').prop('checked', false);
                } else {
                    showAlert('error', response.error || 'Failed to create group. Please try again.');
                }
            },
            error: function(xhr, status, error) {
                console.error('Group creation error:', error);
                showAlert('error', 'An error occurred while creating the group. Please try again.');
            },
            complete: function() {
                // Re-enable the submit button regardless of success/failure
                $submitBtn.prop('disabled', false);
            }
        });
    });
    // Helper function to show alerts
    function showAlert(type, message, isDismissible = true, isFileTypeError = false) {
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
                ${isFileTypeError ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                    <strong>Supported File Types:</strong><br>
                    <small>
                        Images: ${SUPPORTED_FILE_TYPES.Images}<br>
                        Videos: ${SUPPORTED_FILE_TYPES.Videos}<br>
                        Documents: ${SUPPORTED_FILE_TYPES.Documents}<br>
                        Max size: 50MB
                    </small>
                </div>` : ''}
            </div>`;

        // Remove any existing alerts
        $('.alert').remove();
        
        // Add new alert to body
        $('body').append(alertHtml);

        // Auto-dismiss after 5 seconds if not a file type error
        if (!isFileTypeError) {
            setTimeout(() => {
                $('.alert').fadeOut(300, function() { $(this).remove(); });
            }, 5000);
        }
    }

    // Add this function to handle group contacts
    function addGroupToContacts(groupId, groupName, members) {
        let groupElement = `
            <li class="contact-li group-chat" data-group-id="${groupId}">
                <div class="d-flex bd-highlight">
                    <div class="img_cont">
                        <img src="/static/img/group-avatar.png" class="rounded-circle user_img">
                        <span class="group_icon"><i class="fas fa-users"></i></span>
                    </div>
                    <div class="user_info">
                        <span>${sanitizeInput(groupName)}</span>
                        <p>${members.length} members</p>
                    </div>
                </div>
            </li>`;

        // Add the group to the contacts list
        $('.contacts').append(groupElement);

        // Add click handler for the new group
        $(`.contact-li[data-group-id="${groupId}"]`).on('click', function() {
            $('.contact-li').removeClass('active');
            $(this).addClass('active');
            currentGroupId = groupId;
            active_user_id = null;
            isGroupChat = true;
            loadGroupChat(groupId);
        });
    }

    // Add this function to load group chat
    function loadGroupChat(groupId) {
        $.ajax({
            url: '/get_group_chat/',
            method: 'GET',
            data: { group_id: groupId },
            success: function(response) {
                if (response.success) {
                    messageWrapper.find('.msg_card_body').empty();
                    response.messages.forEach(function(msg) {
                        newMessage(
                            msg.message,
                            msg.sent_by,
                            groupId,
                            msg.attachments || [],
                            msg.attachment_names || {}
                        );
                    });
                } else {
                    showAlert('error', 'Failed to load group chat. Please try again.');
                }
            },
            error: function() {
                showAlert('error', 'An error occurred while loading group chat.');
            }
        });
    }

    // Add CSRF token utility
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
});
