let input_message = $('#input-message');
let send_message_form = $('#send-message-form');
const USER_ID = $('#logged-in-user').val();
let active_thread_id = '';  // Initialize as empty string
let active_user_id = null;
let fileInput = $('#file-input');
let messageWrapper = $('#message-wrapper');

// Group Chat Variables
let isGroupChat = false;
let currentGroupId = null;
let groupMembers = new Set();

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
            
            if (data.is_group_message) {
                // Handle group message
                if (data.group_id === currentGroupId) {
                    newMessage(data.message, data.sent_by, data.thread_id, data.attachment_urls, data.attachment_names);
                } else {
                    // Update group chat preview if not in current view
                    let groupThread = $(`.group-chat[group-id="${data.group_id}"]`);
                    if (groupThread.length) {
                        let previewText = data.message || 'New attachment';
                        if (previewText.length > 30) {
                            previewText = previewText.substring(0, 30) + '...';
                        }
                        groupThread.find('.user_info p').html(`<strong>New message: ${previewText}</strong>`);
                    }
                }
            } else {
                let message = data.message;
                let sent_by_id = data.sent_by;
                let send_to_id = data.send_to;
                let thread_id = data.thread_id || '';  // Ensure thread_id is a string
                let attachment_urls = data.attachment_urls || [];
                let attachment_names = data.attachment_names || {};

                // Handle received message
                if (sent_by_id === USER_ID) {
                    // Message sent by current user
                    if (send_to_id === active_user_id) {
                        newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
                    }
                } else if (send_to_id === USER_ID) {
                    // Message received from another user
                    if (sent_by_id === active_user_id) {
                        // If we're currently chatting with the sender, show the message
                        newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
                    } else {
                        // If we're not currently chatting with the sender, update their thread
                        let senderThread = $(`.contact-li[user-id="${sent_by_id}"]`);
                        if (senderThread.length) {
                            // Store the message in the thread's data
                            let threadMessages = senderThread.data('pending_messages') || [];
                            threadMessages.push({
                                message: message,
                                sent_by_id: sent_by_id,
                                thread_id: thread_id,
                                attachment_urls: attachment_urls,
                                attachment_names: attachment_names
                            });
                            senderThread.data('pending_messages', threadMessages);
                            
                            // Update the thread's message preview
                            let previewText = message || 'New attachment';
                            if (previewText.length > 30) {
                                previewText = previewText.substring(0, 30) + '...';
                            }
                            senderThread.find('.user_info p').html(`<strong>New message: ${previewText}</strong>`);
                        }
                    }
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
            // Handle group chat selection
            isGroupChat = true;
            currentGroupId = $(this).attr('group-id');
            groupMembers = new Set(JSON.parse($(this).attr('data-members')));
            
            // Update UI for group chat
            let groupName = $(this).find('.user_info span').text();
            messageWrapper.attr('group-id', currentGroupId);
            messageWrapper.find('.user_info span').text(groupName);
            messageWrapper.find('.user_info p').text(`${groupMembers.size} members`);
            
            // Fetch group chat history
            fetch_group_chat_history(currentGroupId);
        } else {
            // Handle regular one-on-one chat selection
            isGroupChat = false;
            currentGroupId = null;
            active_user_id = $(this).attr('user-id');
            
            // Update UI for regular chat
            let username = $(this).find('.user_info span').text();
            messageWrapper.removeAttr('group-id');
            messageWrapper.attr('other-user-id', active_user_id);
            messageWrapper.find('.user_info span').text(username);
            
            // Fetch regular chat history
            fetch_chat_history(active_user_id);
        }
    });

    send_message_form.on('submit', function(e) {
        e.preventDefault();
        let message = input_message.val().trim();
        let files = fileInput[0].files;

        if (!active_user_id && !currentGroupId) {
            alert('Please select a chat to send a message');
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

    function sendMessage(message, attachment_urls, attachment_names) {
        if (!active_user_id && !currentGroupId) {
            alert('Please select a chat to send a message');
            return;
        }

        let data = {
            'message': message,
            'sent_by': USER_ID,
            'attachment_urls': attachment_urls || [],
            'attachment_names': attachment_names || {}
        };

        if (isGroupChat) {
            data.group_id = currentGroupId;
            data.is_group_message = true;
        } else {
            data.send_to = active_user_id;
            data.is_group_message = false;
        }

        console.log('Sending message:', data);
        socket.send(JSON.stringify(data));
        input_message.val('');
        fileInput.val('');
    }

    function newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names) {
        if (!message && (!attachment_urls || !attachment_urls.length)) return;

        let message_element = '';
        let currentTime = new Date().toLocaleString();

        if (sent_by_id === USER_ID) {
            message_element = `
                <div class="d-flex justify-content-end mb-4 replied">
                    <div class="msg_cotainer_send">
                        ${message ? `<span class="message-text">${message}</span><br>` : ''}
                        ${attachment_urls && attachment_urls.map(url => {
                            const fileExt = url.split('.').pop().toLowerCase();
                            const originalName = attachment_names[url] || url.split('/').pop();
                            if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
                                return `<img src="${url}" alt="${originalName}" class="chat-image" style="max-width: 200px; border-radius: 10px; margin-top: 5px;"><br>`;
                            } else if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
                                return `<video controls class="chat-video" style="max-width: 200px; border-radius: 10px; margin-top: 5px;"><source src="${url}" type="video/${fileExt}">Your browser does not support the video tag.</video><br>`;
                            } else {
                                return `<a href="${url}" target="_blank" class="attachment-btn" title="${originalName}"><i class="fas fa-file-${fileExt}"></i> ${originalName}</a><br>`;
                            }
                        }).join('')}
                        <span class="msg_time_send">${currentTime}</span>
                    </div>
                    <div class="img_cont_msg">
                        <img src="https://static.turbosquid.com/Preview/001292/481/WV/_D.jpg" class="rounded-circle user_img_msg">
                    </div>
                </div>
            `;
        } else {
            message_element = `
                <div class="d-flex mb-4 received">
                    <div class="img_cont_msg">
                        <img src="https://static.turbosquid.com/Preview/001292/481/WV/_D.jpg" class="rounded-circle user_img_msg">
                    </div>
                    <div class="msg_cotainer">
                        ${message ? `<span class="message-text">${message}</span><br>` : ''}
                        ${attachment_urls && attachment_urls.map(url => {
                            const fileExt = url.split('.').pop().toLowerCase();
                            const originalName = attachment_names[url] || url.split('/').pop();
                            if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
                                return `<img src="${url}" alt="${originalName}" class="chat-image" style="max-width: 200px; border-radius: 10px; margin-top: 5px;"><br>`;
                            } else if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
                                return `<video controls class="chat-video" style="max-width: 200px; border-radius: 10px; margin-top: 5px;"><source src="${url}" type="video/${fileExt}">Your browser does not support the video tag.</video><br>`;
                            } else {
                                return `<a href="${url}" target="_blank" class="attachment-btn" title="${originalName}"><i class="fas fa-file-${fileExt}"></i> ${originalName}</a><br>`;
                            }
                        }).join('')}
                        <span class="msg_time">${currentTime}</span>
                    </div>
                </div>
            `;
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
        thread_id = thread_id || '';  // Ensure thread_id is a string
        
        // If we're in the relevant chat, show the message immediately
        if (active_user_id === (sent_by_id === USER_ID ? send_to : sent_by_id)) {
            newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
        } else {
            // Store the message for later
            let userThread = $(`.contact-li[user-id="${sent_by_id === USER_ID ? send_to : sent_by_id}"]`);
            if (userThread.length) {
                let pendingMessages = userThread.data('pending_messages') || [];
                pendingMessages.push(messageData);
                userThread.data('pending_messages', pendingMessages);
                
                // Update the message preview
                let previewText = message || 'New attachment';
                if (previewText.length > 30) {
                    previewText = previewText.substring(0, 30) + '...';
                }
                userThread.find('.user_info p').html(`<strong>New message: ${previewText}</strong>`);
            }
        }
    }

    function fetch_chat_history(other_user_id) {
        // Clear existing messages first
        messageWrapper.find('.msg_card_body').empty();
        
        $.ajax({
            url: '/fetch_chat_history/',
            method: 'GET',
            data: {
                other_user_id: other_user_id,
                current_user_id: USER_ID
            },
            success: function(response) {
                console.log('Chat history fetched:', response);
                if (response.thread_id) {
                    active_thread_id = String(response.thread_id);  // Convert to string
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
            url: '/fetch_group_chat_history/',
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

    // Initialize WebSocket reconnection
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
        };
        
        socket.onclose = function(e) {
            console.log('WebSocket disconnected. Reconnecting in 5 seconds...');
            setTimeout(initWebSocket, 5000);
        };
        
        socket.onerror = function(e) {
            console.error('WebSocket error:', e);
        };
        
        socket.onmessage = function(e) {
            try {
                let data = JSON.parse(e.data);
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
        $('.contact-li').each(function() {
            let userId = $(this).attr('user-id');
            let username = $(this).find('.user_info span').text();
            
            $('.member-selection').append(`
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input" id="member-${userId}" value="${userId}">
                    <label class="custom-control-label" for="member-${userId}">
                        <div class="d-flex align-items-center">
                            <img src="/static/img/default-avatar.png" class="rounded-circle" width="30" height="30">
                            <span class="ml-2">${username}</span>
                        </div>
                    </label>
                </div>
            `);
        });
    }

    // Create Group Submit Handler
    $('#createGroupSubmit').on('click', function() {
        let groupName = $('#groupName').val().trim();
        let groupDescription = $('#groupDescription').val().trim();
        let selectedMembers = [];
        
        $('.member-selection input:checked').each(function() {
            selectedMembers.push($(this).val());
        });

        if (groupName && selectedMembers.length > 0) {
            // Add current user to the group members
            selectedMembers.push(USER_ID);
            
            // Send group creation request
            $.ajax({
                url: '/create_group/',
                method: 'POST',
                data: {
                    name: groupName,
                    description: groupDescription,
                    members: JSON.stringify(selectedMembers)
                },
                success: function(response) {
                    if (response.success) {
                        // Add group to contacts list
                        addGroupToContacts(response.group_id, groupName, selectedMembers);
                        $('#createGroupModal').modal('hide');
                        
                        // Show success message
                        showAlert('success', 'Group created successfully!');
                        
                        // Clear form
                        $('#groupName').val('');
                        $('#groupDescription').val('');
                        $('.member-selection input').prop('checked', false);
                    } else {
                        showAlert('error', 'Failed to create group: ' + response.error);
                    }
                },
                error: function(xhr, status, error) {
                    showAlert('error', 'Failed to create group. Please try again.');
                }
            });
        } else {
            showAlert('error', 'Please enter a group name and select at least one member.');
        }
    });

    // Helper function to show alerts
    function showAlert(type, message) {
        let alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
        let alert = $(`<div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>`);
        
        $('.contacts_card').prepend(alert);
        setTimeout(() => alert.alert('close'), 3000);
    }

    // Add Group to Contacts List
    function addGroupToContacts(groupId, groupName, members) {
        let groupElement = `
            <li class="contact-li group-chat" group-id="${groupId}" data-members='${JSON.stringify(members)}'>
                <div class="d-flex bd-highlight">
                    <div class="img_cont">
                        <img src="/static/img/group-avatar.png" class="rounded-circle user_img">
                        <span class="group_icon"><i class="fas fa-users"></i></span>
                    </div>
                    <div class="user_info">
                        <span>${groupName}</span>
                        <p>${members.length} members</p>
                    </div>
                    <div class="group_actions">
                        <button class="btn btn-sm btn-info group-info-btn">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </div>
                </div>
            </li>
        `;
        $('.contacts').append(groupElement);
    }
});
