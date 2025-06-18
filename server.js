const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

const meetings = new Map(); // Stores active meetings
const clients = new Map(); // Stores connected clients

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clients.set(clientId, ws);
  console.log(`New client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(clientId, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function handleMessage(clientId, data) {
  const { type, meetingId, payload } = data;

  switch (type) {
    case 'create-meeting':
      handleCreateMeeting(clientId, payload);
      break;
    case 'join-request':
      handleJoinRequest(clientId, meetingId, payload);
      break;
    case 'approve-request':
      handleApproveRequest(meetingId, payload);
      break;
    case 'deny-request':
      handleDenyRequest(meetingId, payload.requestId);
      break;
    case 'ice-candidate':
    case 'offer':
    case 'answer':
      forwardWebRTCMessage(meetingId, clientId, type, payload);
      break;
    default:
      console.log('Unknown message type:', type);
  }
}

function handleCreateMeeting(clientId, { meetingName, userName }) {
  const meetingId = generateMeetingId(meetingName);
  const meeting = {
    id: meetingId,
    moderator: clientId,
    participants: new Map([[clientId, { id: clientId, name: userName }]]),
    pendingRequests: new Map(),
  };

  meetings.set(meetingId, meeting);
  sendToClient(clientId, {
    type: 'meeting-created',
    payload: { meetingId, link: `${getBaseUrl()}/?meeting=${meetingId}` },
  });

  console.log(`Meeting created: ${meetingId} by ${userName}`);
}

function handleJoinRequest(clientId, meetingId, { userName }) {
  const meeting = meetings.get(meetingId);
  if (!meeting) {
    sendToClient(clientId, {
      type: 'error',
      payload: { message: 'Meeting not found' },
    });
    return;
  }

  const requestId = uuidv4();
  meeting.pendingRequests.set(requestId, { id: clientId, name: userName });

  // Notify moderator
  sendToClient(meeting.moderator, {
    type: 'new-request',
    payload: { requestId, userName, meetingId },
  });

  // Notify requester
  sendToClient(clientId, {
    type: 'request-pending',
    payload: { requestId },
  });

  console.log(`Join request from ${userName} for meeting ${meetingId}`);
}

function handleApproveRequest(meetingId, { requestId }) {
  const meeting = meetings.get(meetingId);
  if (!meeting) return;

  const request = meeting.pendingRequests.get(requestId);
  if (!request) return;

  // Add to participants
  meeting.participants.set(request.id, { id: request.id, name: request.name });
  meeting.pendingRequests.delete(requestId);

  // Notify requester
  sendToClient(request.id, {
    type: 'request-approved',
    payload: { meetingId },
  });

  // Notify moderator
  sendToClient(meeting.moderator, {
    type: 'request-updated',
    payload: { requestId, status: 'approved' },
  });

  console.log(`Request ${requestId} approved for meeting ${meetingId}`);
}

function handleDenyRequest(meetingId, requestId) {
  const meeting = meetings.get(meetingId);
  if (!meeting) return;

  const request = meeting.pendingRequests.get(requestId);
  if (!request) return;

  meeting.pendingRequests.delete(requestId);

  // Notify requester
  sendToClient(request.id, {
    type: 'request-denied',
    payload: { meetingId },
  });

  // Notify moderator
  sendToClient(meeting.moderator, {
    type: 'request-updated',
    payload: { requestId, status: 'denied' },
  });

  console.log(`Request ${requestId} denied for meeting ${meetingId}`);
}

function forwardWebRTCMessage(meetingId, senderId, type, payload) {
  const meeting = meetings.get(meetingId);
  if (!meeting) return;

  const { targetId } = payload;
  if (!targetId) return;

  sendToClient(targetId, {
    type,
    payload: { ...payload, senderId },
  });
}

function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function generateMeetingId(meetingName) {
  const cleanName = meetingName.toLowerCase().replace(/\s+/g, '-');
  const randomId = uuidv4().split('-')[0];
  return `${cleanName}-${randomId}`;
}

function getBaseUrl() {
  return process.env.BASE_URL || 'http://localhost:3000';
}

// REST API for meeting info
app.get('/api/meetings/:id', (req, res) => {
  const meeting = meetings.get(req.params.id);
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  res.json({
    id: meeting.id,
    participantCount: meeting.participants.size,
    pendingRequests: meeting.pendingRequests.size,
  });
});