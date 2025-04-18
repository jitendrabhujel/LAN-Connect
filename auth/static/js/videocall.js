class VideoCall {
    constructor(socket) {
        this.socket = socket;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.isInitiator = false;
        this.remoteUserId = null;
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.isAudioMuted = false;
        this.isVideoOff = false;
        this.callEnded = false;
        this.pendingCall = null;
        this.pendingCandidates = []; // Store candidates that arrive before peer connection is ready
        this.recordedChunks = [];
        this.mediaRecorder = null;

        // Enhanced WebRTC configuration for LAN
        this.configuration = {
            iceServers: [
                { 
                    urls: [
                        'stun:stun.l.google.com:19302', 
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302'
                    ]
                }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Show video call button when a user is selected
        $('.contact-li').on('click', (e) => {
            const userId = $(e.currentTarget).attr('user-id');
            if (userId) {
                $('#start-video-call').show();
                this.remoteUserId = userId;
            } else {
                $('#start-video-call').hide();
                this.remoteUserId = null;
            }
        });

        // Start call button
        $('#start-video-call').on('click', () => {
            if (this.remoteUserId) {
                this.startCall(this.remoteUserId);
            }
        });

        // Call controls
        $('#toggleMute').on('click', () => this.toggleAudio());
        $('#toggleVideo').on('click', () => this.toggleVideo());
        $('#endCall').on('click', () => this.endCall());

        // Modal close handler
        $('#videoCallModal').on('hidden.bs.modal', () => {
            this.endCall();
        });

        // Add permission retry handler
        $('#retryPermissions').on('click', async () => {
            $('#permissionInstructions').addClass('d-none');
            const success = await this.checkPermissions();
            if (success) {
                $('#permissionModal').modal('hide');
                // If we were trying to start a call, proceed with it
                if (this.pendingCall) {
                    this.startCall(this.pendingCall);
                    this.pendingCall = null;
                }
            }
        });
    }

    handleWebSocketMessage(data) {
        if (data.type === 'video-call') {
            switch (data.action) {
                case 'offer':
                    this.handleOffer(data);
                    break;
                case 'answer':
                    this.handleAnswer(data);
                    break;
                case 'candidate':
                    this.handleCandidate(data);
                    break;
                case 'end-call':
                    this.handleEndCall();
                    break;
            }
        }
    }

    async checkPermissions() {
        try {
            // First check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support video calls');
            }

            // Update status badges to checking
            $('#cameraStatus, #micStatus').text('Checking...').removeClass().addClass('status-badge status-checking');

            // Check permissions status
            const permissions = await navigator.permissions.query({ name: 'camera' });
            const micPermissions = await navigator.permissions.query({ name: 'microphone' });

            // Update UI based on permission status
            this.updatePermissionStatus('camera', permissions.state);
            this.updatePermissionStatus('mic', micPermissions.state);

            // If either permission is denied, show instructions
            if (permissions.state === 'denied' || micPermissions.state === 'denied') {
                $('#permissionInstructions').removeClass('d-none');
                return false;
            }

            // If permissions are granted, try to access devices
            if (permissions.state === 'granted' && micPermissions.state === 'granted') {
                await this.setupLocalStream();
                return true;
            }

            // If permissions are prompt, show the browser's permission dialog
            if (permissions.state === 'prompt' || micPermissions.state === 'prompt') {
                await this.setupLocalStream();
                return true;
            }

        } catch (error) {
            console.error('Error checking permissions:', error);
            this.updatePermissionStatus('camera', 'denied');
            this.updatePermissionStatus('mic', 'denied');
            $('#permissionInstructions').removeClass('d-none');
            return false;
        }
    }

    updatePermissionStatus(device, state) {
        const statusElement = device === 'camera' ? '#cameraStatus' : '#micStatus';
        $(statusElement).removeClass().addClass('status-badge');
        
        switch (state) {
            case 'granted':
                $(statusElement).addClass('status-granted').text('Allowed');
                break;
            case 'denied':
                $(statusElement).addClass('status-denied').text('Blocked');
                break;
            case 'prompt':
                $(statusElement).addClass('status-checking').text('Waiting...');
                break;
            default:
                $(statusElement).addClass('status-checking').text('Unknown');
        }
    }

    async setupLocalStream() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support video calls');
            }

            // Stop any existing tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Request permissions with constraints
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
                console.log('Local stream set up successfully');
                
                // Set up media recording
                try {
                    this.setupMediaRecording(this.localStream);
                } catch (error) {
                    console.warn('Media recording not supported:', error);
                }
                
                return true;
            } else {
                throw new Error('Local video element not found');
            }
        } catch (error) {
            console.error('Error accessing media devices:', error);
            let errorMessage = this.getErrorMessage(error);
            this.showPermissionAlert(errorMessage);
            throw error;
        }
    }

    setupMediaRecording(stream) {
        // Initialize recorded chunks array
        this.recordedChunks = [];
        
        // Create MediaRecorder instance
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9,opus'
        });

        // Handle data available event
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        // Start recording
        this.mediaRecorder.start();
    }

    getErrorMessage(error) {
        switch (error.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                return 'Please allow access to your camera and microphone to make video calls.';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return 'No camera or microphone found. Please check your devices.';
            case 'NotReadableError':
            case 'TrackStartError':
                return 'Your camera or microphone is already in use by another application.';
            case 'OverconstrainedError':
                return 'Could not find suitable camera settings. Please check your device.';
            default:
                return 'Failed to access camera and microphone. Please check your permissions and try again.';
        }
    }

    showPermissionAlert(message) {
        // Remove any existing alerts
        $('.permission-alert').remove();
        
        const alertHtml = `
            <div class="permission-alert alert alert-warning alert-dismissible fade show" role="alert" 
                 style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; 
                        min-width: 300px; background-color: #2c2c2c; color: white; border: 1px solid #ffc107;">
                <div class="d-flex align-items-center">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <div>
                        <strong>Permission Required</strong><br>
                        ${message}
                        <div class="mt-2">
                            <small>
                                How to enable:<br>
                                1. Click the camera icon in your browser's address bar<br>
                                2. Select "Allow" for both camera and microphone<br>
                                3. Refresh the page and try again
                            </small>
                        </div>
                    </div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        $('body').append(alertHtml);

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            $('.permission-alert').fadeOut(300, function() {
                $(this).remove();
            });
        }, 15000);
    }

    async startCall(remoteUserId) {
        try {
            this.isInitiator = true;
            this.remoteUserId = remoteUserId;
            
            // Show permission modal
            $('#permissionModal').modal('show');
            
            // First set up local stream
            const streamSuccess = await this.setupLocalStream();
            if (!streamSuccess) {
                return;
            }

            // Then create peer connection
            const peerSuccess = await this.createPeerConnection();
            if (!peerSuccess) {
                return;
            }
            
            // Create and send offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            this.sendSignalingMessage({
                type: 'video-call',
                action: 'offer',
                offer: offer,
                to: remoteUserId
            });

            $('#permissionModal').modal('hide');
            $('#videoCallModal').modal('show');
            this.addCallStatusMessage('You started a video chat');
        } catch (error) {
            console.error('Error starting call:', error);
            this.showPermissionAlert('Failed to start video call. Please try again.');
        }
    }

    async handleOffer(data) {
        try {
            this.isInitiator = false;
            this.remoteUserId = data.from;
            
            // Show permission modal first
            $('#permissionModal').modal('show');
            
            // Check permissions and setup local stream first
            const permissionsGranted = await this.checkPermissions();
            if (!permissionsGranted) {
                this.pendingCall = data.from;
                return;
            }

            // Create peer connection before showing call notification
            await this.createPeerConnection();

            // Set remote description immediately after peer connection is created
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            // Show call notification only after permissions are granted
            $('#permissionModal').modal('hide');
            
            // Show custom call notification
            const callerName = $(`.contact-li[user-id="${data.from}"] .user_info span`).text();
            $('#callerName').text(callerName || 'Unknown User');
            
            // Get caller's avatar if available
            const callerAvatar = $(`.contact-li[user-id="${data.from}"] .user_img`).attr('src');
            if (callerAvatar) {
                $('#callerAvatar').attr('src', callerAvatar);
            }

            // Show notification
            $('#callNotification').show();

            // Handle accept/reject buttons
            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    $('#callNotification').hide();
                    $('#acceptCall').off('click');
                    $('#rejectCall').off('click');
                };

                $('#acceptCall').one('click', async () => {
                    cleanup();
                    try {
                        const answer = await this.peerConnection.createAnswer();
                        await this.peerConnection.setLocalDescription(answer);
                        
                        this.sendSignalingMessage({
                            type: 'video-call',
                            action: 'answer',
                            answer: answer,
                            to: data.from
                        });

                        // Process any pending ICE candidates
                        if (this.pendingCandidates.length > 0) {
                            console.log('Processing pending candidates after accepting call');
                            for (const candidate of this.pendingCandidates) {
                                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            }
                            this.pendingCandidates = [];
                        }

                        $('#videoCallModal').modal('show');
                        this.addCallStatusMessage('Video chat started');
                        resolve();
                    } catch (error) {
                        console.error('Error accepting call:', error);
                        reject(error);
                    }
                });

                $('#rejectCall').one('click', () => {
                    cleanup();
                    this.sendSignalingMessage({
                        type: 'video-call',
                        action: 'end-call',
                        to: data.from
                    });
                    this.addCallStatusMessage('Video chat rejected');
                    this.handleEndCall();
                    resolve();
                });
            });
        } catch (error) {
            console.error('Error handling offer:', error);
            $('#callNotification').hide();
            this.showPermissionAlert('Failed to handle incoming call. Please try again.');
        }
    }

    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleCandidate(data) {
        try {
            if (!data.candidate) return;

            // If peer connection doesn't exist or is in wrong state, queue the candidate
            if (!this.peerConnection || 
                !this.peerConnection.remoteDescription || 
                !this.peerConnection.localDescription) {
                console.log('Queuing ICE candidate - connection not ready');
                this.pendingCandidates.push(data.candidate);
                return;
            }

            // Add the ICE candidate if connection is ready
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('Successfully added ICE candidate');
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
            // Don't throw the error, just log it and continue
            // Queue the candidate for later if there was an error
            this.pendingCandidates.push(data.candidate);
        }
    }

    async createPeerConnection() {
        try {
            if (this.peerConnection) {
                // Clean up existing connection
                this.peerConnection.close();
                this.peerConnection = null;
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);
            console.log('Peer connection created');

            // Add local stream tracks to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
                console.log('Added local tracks to peer connection');
            } else {
                throw new Error('Local stream not initialized');
            }

            // Handle incoming stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote track');
                if (event.streams && event.streams[0]) {
                    this.remoteVideo.srcObject = event.streams[0];
                    this.remoteStream = event.streams[0];
                }
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Generated local ICE candidate');
                    this.sendSignalingMessage({
                        type: 'video-call',
                        action: 'candidate',
                        candidate: event.candidate,
                        to: this.remoteUserId
                    });
                }
            };

            // Handle ICE connection state changes
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
                if (this.peerConnection.iceConnectionState === 'failed') {
                    console.log('ICE connection failed - restarting ICE');
                    this.peerConnection.restartIce();
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                switch (this.peerConnection.connectionState) {
                    case 'connected':
                        console.log('Peers connected successfully');
                        break;
                    case 'failed':
                        this.handleConnectionFailure();
                        break;
                    case 'closed':
                        console.log('Peer connection closed');
                        break;
                }
            };

            return true;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            this.showPermissionAlert('Failed to create peer connection. Please try again.');
            return false;
        }
    }

    sendSignalingMessage(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.error('WebSocket is not connected');
            alert('Connection error. Please refresh the page and try again.');
        }
    }

    toggleAudio() {
        if (this.localStream) {
            this.isAudioMuted = !this.isAudioMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isAudioMuted;
            });
            $('#toggleMute i').toggleClass('fa-microphone fa-microphone-slash');
        }
    }

    toggleVideo() {
        if (this.localStream) {
            this.isVideoOff = !this.isVideoOff;
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = !this.isVideoOff;
            });
            $('#toggleVideo i').toggleClass('fa-video fa-video-slash');
        }
    }

    endCall() {
        // Send end-call signal to remote peer
        if (this.remoteUserId) {
            this.sendSignalingMessage({
                type: 'video-call',
                action: 'end-call',
                to: this.remoteUserId
            });
        }

        // Save any recorded media if available
        if (this.mediaRecorder && this.recordedChunks.length > 0) {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const formData = new FormData();
            
            // Generate a filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `video_call_${timestamp}.webm`;
            
            formData.append('files', blob, fileName);
            
            $.ajax({
                url: '/upload/',
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function(response) {
                    console.log('Video saved successfully:', response);
                    // Add video message to chat
                    if (window.newMessage && response.attachment_urls && response.attachment_urls.length > 0) {
                        window.newMessage('Video call recording', USER_ID, null, response.attachment_urls, response.attachment_names);
                    }
                },
                error: function(error) {
                    console.error('Error saving video:', error);
                }
            });
        }

        this.handleEndCall();
    }

    handleEndCall() {
        // Only add end message if we haven't already ended the call
        if (this.peerConnection && !this.callEnded) {
            this.addCallStatusMessage('Video chat ended');
            this.callEnded = true;  // Mark call as ended
        }

        // Stop recording if active
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
        }

        // Clear video elements
        if (this.localVideo) this.localVideo.srcObject = null;
        if (this.remoteVideo) this.remoteVideo.srcObject = null;

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Reset state
        this.localStream = null;
        this.remoteStream = null;
        this.isInitiator = false;
        this.recordedChunks = [];
        this.mediaRecorder = null;

        // Hide modal
        $('#videoCallModal').modal('hide');

        // Reset UI
        $('#toggleMute i').removeClass('fa-microphone-slash').addClass('fa-microphone');
        $('#toggleVideo i').removeClass('fa-video-slash').addClass('fa-video');
    }

    handleConnectionFailure() {
        this.showPermissionAlert('Connection failed. This might be due to network issues or firewall settings.');
        this.endCall();
    }

    // Add method to display call status messages
    addCallStatusMessage(message) {
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const statusHtml = `
            <div class="text-center my-2">
                <div class="call-status-message">
                    ${message}
                    <div class="call-time">${currentTime}</div>
                </div>
            </div>
        `;
        $('.msg_card_body').append(statusHtml);
        // Scroll to bottom
        $('.msg_card_body').scrollTop($('.msg_card_body')[0].scrollHeight);
    }
} 
