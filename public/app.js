document.addEventListener('DOMContentLoaded', function() {
    // ... (previous DOM elements and state variables)

    // WebSocket connection
    let socket = null;
    let clientId = null;
    let currentMeeting = null;

    // Initialize WebSocket connection
    function initWebSocket() {
        socket = new WebSocket(config.websocketUrl);
        
        socket.onopen = () => {
            console.log('Connected to WebSocket server');
        };
        
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        socket.onclose = () => {
            console.log('Disconnected from WebSocket server');
            // Try to reconnect after 5 seconds
            setTimeout(initWebSocket, 5000);
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    function handleSocketMessage(data) {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'client-id':
                clientId = data.payload.clientId;
                break;
            case 'meeting-created':
                handleMeetingCreated(data.payload);
                break;
            case 'new-request':
                handleNewRequest(data.payload);
                break;
            case 'request-pending':
                handleRequestPending(data.payload);
                break;
            case 'request-approved':
                handleRequestApproved(data.payload);
                break;
            case 'request-denied':
                handleRequestDenied();
                break;
            case 'request-updated':
                handleRequestUpdated(data.payload);
                break;
            case 'error':
                showError(data.payload.message);
                break;
            // WebRTC messages
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                handleWebRTCMessage(data.type, data.payload);
                break;
        }
    }
    
    function sendSocketMessage(type, payload = {}, meetingId = null) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }
        
        const message = { type, payload };
        if (meetingId) message.meetingId = meetingId;
        
        socket.send(JSON.stringify(message));
    }
    
    // Meeting creation handlers
    function handleMeetingCreated({ meetingId, link }) {
        currentMeeting = { id: meetingId, isModerator: true };
        meetingLink.value = link;
        meetingLinkContainer.classList.add('active');
        participantRequests.classList.add('active');
        
        // Initialize Jitsi meeting
        const yourName = document.getElementById('yourName').value.trim();
        initializeJitsiMeeting(meetingId, yourName, true);
    }
    
    // Participant request handlers
    function handleNewRequest({ requestId, userName, meetingId }) {
        if (!isModerator || meetingId !== currentMeeting?.id) return;
        
        pendingParticipants.set(requestId, {
            id: requestId,
            name: userName,
            meetingId
        });
        
        updatePendingParticipantsList();
    }
    
    function handleRequestPending({ requestId }) {
        requestPendingMsg.classList.add('active');
    }
    
    function handleRequestApproved({ meetingId }) {
        requestPendingMsg.classList.remove('active');
        const participantName = document.getElementById('participantName').value.trim();
        initializeJitsiMeeting(meetingId, participantName, false);
    }
    
    function handleRequestDenied() {
        requestPendingMsg.classList.remove('active');
        showError('Your join request was denied by the moderator');
    }
    
    function handleRequestUpdated({ requestId, status }) {
        pendingParticipants.delete(requestId);
        updatePendingParticipantsList();
    }
    
    // WebRTC handlers (for future extension)
    function handleWebRTCMessage(type, payload) {
        // This would be used for peer-to-peer communication
        // if you extend the app beyond Jitsi integration
        console.log('WebRTC message:', type, payload);
    }
    
    // Enhanced meeting functions
    function startMeeting() {
        const meetingName = document.getElementById('meetingName').value.trim();
        const yourName = document.getElementById('yourName').value.trim();

        if (!meetingName || !yourName) {
            showError('Please enter both meeting name and your name');
            return;
        }

        sendSocketMessage('create-meeting', {
            meetingName,
            userName: yourName
        });
    }

    function requestToJoin() {
        let meetingId = document.getElementById('meetingLinkInput').value.trim();
        const participantName = document.getElementById('participantName').value.trim();

        if (!meetingId || !participantName) {
            showError('Please enter both meeting link and your name');
            return;
        }

        // Extract meeting ID from URL if full link is pasted
        try {
            const url = new URL(meetingId);
            meetingId = url.searchParams.get('meeting');
        } catch (e) {
            // Not a URL, use as-is
        }

        if (!meetingId) {
            showError('Invalid meeting link or ID');
            return;
        }

        currentMeeting = { id: meetingId, isModerator: false };
        sendSocketMessage('join-request', {
            userName: participantName
        }, meetingId);
    }
    
    function approveParticipant(e) {
        const requestId = e.target.getAttribute('data-request');
        sendSocketMessage('approve-request', { requestId }, currentMeeting.id);
    }

    function denyParticipant(e) {
        const requestId = e.target.getAttribute('data-request');
        sendSocketMessage('deny-request', { requestId }, currentMeeting.id);
    }
    
    function showError(message) {
        joinErrorMsg.textContent = message;
        joinErrorMsg.classList.add('active');
        setTimeout(() => {
            joinErrorMsg.classList.remove('active');
        }, 5000);
    }

    // Initialize WebSocket connection when page loads
    initWebSocket();
    
    // ... (rest of the existing code)
});
