let input_message = $('#input-message');
let send_message_form = $('#send-message-form');
const USER_ID = $('#logged-in-user').val();
let active_thread_id = null;
let active_user_id = null;
let fileInput = $('#file-input');
let messageWrapper = $('#message-wrapper');
let notification = $('#notification');
let unreadCounts = {};

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
        console.log('Message received', e);
        try {
            let data = JSON.parse(e.data);
            console.log('Parsed data:', data);
            let message = data.message;
            let sent_by_id = data.sent_by;
            let send_to_id = data.send_to;
            let thread_id = data.thread_id;
            let attachment_urls = data.attachment_urls || [];
            let attachment_names = data.attachment_names || {};

            if (thread_id) {
                // Update active thread ID
                if (!active_thread_id || active_thread_id.startsWith('temp_')) {
                    active_thread_id = thread_id;
                    messageWrapper.attr('chat-id', 'chat_' + thread_id);
                }

                // Show notification for new message if the sender is not the active user
                if (sent_by_id != USER_ID && send_to_id == USER_ID) {
                    if (active_user_id !== sent_by_id.toString()) {
                        unreadCounts[sent_by_id] = (unreadCounts[sent_by_id] || 0) + 1;
                        $(`.contact-li[user-id="${sent_by_id}"] .unread-count`).text(unreadCounts[sent_by_id]).show();
                        notification.show();
                        setTimeout(() => notification.hide(), 5000); // Hide after 5 seconds
                    }
                    // Display the message if the sender is the active user
                    if (active_user_id === sent_by_id.toString()) {
                        newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
                    }
                } else if (sent_by_id == USER_ID && active_user_id === send_to_id.toString()) {
                    newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names);
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
        console.log('Contact clicked');
        $('.contact-li').removeClass('active');
        $(this).addClass('active');
        active_user_id = $(this).attr('user-id');
        console.log('Selected user ID:', active_user_id);

        // Clear the current messages
        messageWrapper.find('.msg_card_body').empty();

        // Update the UI
        let username = $(this).find('.user_info span').text();
        messageWrapper.attr('other-user-id', active_user_id);
        messageWrapper.find('.user_info span').text(username);
        messageWrapper.find('.user_info p').text('0 messages');

        // Clear unread count
        unreadCounts[active_user_id] = 0;
        $(this).find('.unread-count').text(0).hide();

        // Fetch and display chat history
        fetchChatHistory(active_user_id);
    });

    send_message_form.on('submit', function(e) {
        e.preventDefault();
        let message = input_message.val().trim();
        let files = fileInput[0].files;

        if (!active_user_id) {
            alert('Please select a user to send a message');
            return;
        }

        let formData = new FormData();
        formData.append('sent_by', USER_ID);
        formData.append('send_to', active_user_id);
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
        if (!active_user_id) return;
        let data = {
            'message': message,
            'sent_by': USER_ID,
            'send_to': active_user_id,
            'attachment_urls': attachment_urls,
            'attachment_names': attachment_names
        };
        data = JSON.stringify(data);
        console.log('Sending:', data);
        socket.send(data);
        input_message.val('');
        fileInput.val('');
        // Ensure the input field stays at the bottom
        let msgBody = messageWrapper.find('.msg_card_body');
        msgBody.scrollTop(msgBody[0].scrollHeight);
    }

    function newMessage(message, sent_by_id, thread_id, attachment_urls, attachment_names) {
        if (!message && !attachment_urls.length) return;

        let message_element = '';
        let currentTime = new Date().toLocaleString();
        if (sent_by_id == USER_ID) {
            message_element = `
                <div class="d-flex justify-content-end mb-4 replied">
                    <div class="msg_cotainer_send">
                        ${message ? message + '<br>' : ''}
                        ${attachment_urls.map(url => {
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
                        <img src="https://static.turbosquid.com/Preview/001292/481/WV/_D" class="rounded-circle user_img_msg">
                    </div>
                </div>
            `;
        } else {
            message_element = `
                <div class="d-flex mb-4 received">
                    <div class="img_cont_msg">
                        <img src="https://static.turbosquid.com/Preview/001292/481/WV/_D" class="rounded-circle user_img_msg">
                    </div>
                    <div class="msg_cotainer">
                        ${message ? message + '<br>' : ''}
                        ${attachment_urls.map(url => {
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
        msgBody.append($(message_element));
        msgBody.scrollTop(msgBody[0].scrollHeight); // Ensure scroll to bottom after new message
        messageWrapper.find('.user_info p').text(msgBody.find('.received, .replied').length + ' messages');
        console.log('Message appended to thread:', thread_id);
    }

    function fetchChatHistory(other_user_id) {
        // Fetch chat history from the server
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
                    active_thread_id = response.thread_id;
                    messageWrapper.attr('chat-id', 'chat_' + active_thread_id);
                }
                if (response.messages) {
                    response.messages.forEach(function(msg) {
                        let message = msg.message;
                        let sent_by_id = msg.sent_by;
                        let attachment_urls = msg.attachment_urls || [];
                        let attachment_names = msg.attachment_names || {};
                        newMessage(message, sent_by_id, active_thread_id, attachment_urls, attachment_names);
                    });
                }
                // Fetch unread counts after loading history
                fetchUnreadCounts();
            },
            error: function(xhr, status, error) {
                console.error('Failed to fetch chat history:', error);
            }
        });
    }

    function fetchUnreadCounts() {
        $.ajax({
            url: '/fetch_unread_counts/',
            method: 'GET',
            data: {
                current_user_id: USER_ID
            },
            success: function(response) {
                console.log('Unread counts fetched:', response);
                unreadCounts = response.unread_counts || {};
                for (let userId in unreadCounts) {
                    if (unreadCounts[userId] > 0) {
                        $(`.contact-li[user-id="${userId}"] .unread-count`).text(unreadCounts[userId]).show();
                    }
                }
            },
            error: function(xhr, status, error) {
                console.error('Failed to fetch unread counts:', error);
            }
        });
    }
});