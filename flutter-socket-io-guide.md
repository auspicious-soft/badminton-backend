# Flutter Socket.IO Implementation Guide

This guide provides instructions for implementing Socket.IO in your Flutter app, based on our working React implementation.

## Connection Setup

Use the `socket_io_client` package to connect to our Socket.IO server:

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

// Create socket connection
IO.Socket socket = IO.io('https://api.projectplayapp.com', 
  IO.OptionBuilder()
    .setPath('/socket.io/')
    .setTransports(['polling']) // Start with polling for compatibility
    .setReconnection(true)
    .setReconnectionAttempts(5)
    .setReconnectionDelay(1000)
    .setQuery({'token': 'YOUR_JWT_TOKEN'})
    .build()
);
```

## Event Listeners

Set up these event listeners to handle the connection and messages:

```dart
// Connection events
socket.onConnect((_) {
  print('Socket connected!');
  // Update UI to show connected status
});

socket.on('connection_success', (data) {
  print('Connection success: $data');
  // data contains userId and message
});

socket.onDisconnect((reason) {
  print('Socket disconnected: $reason');
  // Update UI to show disconnected status
});

socket.onConnectError((error) {
  print('Connection error: $error');
  // Show error in UI
});

// Message events
socket.on('chat_message', (data) {
  print('Chat message received: $data');
  // Handle incoming chat message
  // data structure: {chatId: string, message: {content, sender, timestamp}}
});

socket.on('message_received', (data) {
  print('Message received acknowledgment: $data');
  // Server acknowledged your message
});

// Typing indicators
socket.on('user_typing', (data) {
  print('User typing: $data');
  // Show typing indicator
  // data structure: {chatId: string, userId: string, isTyping: boolean}
});

// Online status events
socket.on('online_users', (data) {
  print('Online users: $data');
  // Initial list of online users
  // data structure: array of user IDs who are currently online
  List<String> onlineUserIds = List<String>.from(data);
  // Update your UI or store this list
});

socket.on('user_status_change', (data) {
  print('User status changed: $data');
  // Real-time updates when users come online or go offline
  // data structure: {userId: string, status: 'online'|'offline'}
  String userId = data['userId'];
  String status = data['status'];
  // Update UI to reflect this user's online status
});

// Other events
socket.onAny((event, data) {
  print('Received event $event: $data');
  // Handle any other events
});
```

## Sending Messages

Send messages to the server:

```dart
// Join a chat room
void joinChat(String chatId) {
  socket.emit('join_chat', chatId);
}

// Send a message
void sendMessage(String chatId, String content) {
  socket.emit('send_message', {
    'chatId': chatId,
    'content': content,
    'contentType': 'text'
  });
}

// Send typing indicator
void sendTypingStatus(String chatId, bool isTyping) {
  socket.emit('typing', {
    'chatId': chatId,
    'isTyping': isTyping
  });
}

// Leave a chat room
void leaveChat(String chatId) {
  socket.emit('leave_chat', chatId);
}

// Check if a specific user is online (alternative API approach)
Future<bool> checkUserOnlineStatus(String userId) async {
  // This would be an API call to your backend
  // Example implementation using http package:
  // final response = await http.get(
  //   Uri.parse('https://api.projectplayapp.com/users/$userId/online'),
  //   headers: {'Authorization': 'Bearer $token'},
  // );
  // return response.statusCode == 200 && jsonDecode(response.body)['online'];
}
```

## Complete Example

Here's a simplified example of a chat service in Flutter:

```dart
class ChatService {
  late IO.Socket socket;
  final String token;
  
  // Track online users
  Set<String> onlineUsers = {};
  
  ChatService(this.token) {
    _initSocket();
  }
  
  void _initSocket() {
    socket = IO.io('https://api.projectplayapp.com',
      IO.OptionBuilder()
        .setPath('/socket.io/')
        .setTransports(['polling'])
        .setReconnection(true)
        .setReconnectionAttempts(5)
        .setReconnectionDelay(1000)
        .setQuery({'token': token})
        .build()
    );
    
    _setupListeners();
  }
  
  void _setupListeners() {
    socket.onConnect((_) {
      print('Connected to chat server');
    });
    
    socket.on('connection_success', (data) {
      print('Successfully connected: ${data['message']}');
    });
    
    socket.on('chat_message', (data) {
      print('New message: ${data['message']['content']}');
      // Process and display the message
    });
    
    socket.on('message_received', (data) {
      print('Message received by server: ${data['content']}');
      // Update message status to "sent"
    });
    
    socket.on('user_typing', (data) {
      print('User ${data['userId']} is typing in chat ${data['chatId']}');
      // Show typing indicator
    });
    
    // Track online users
    socket.on('online_users', (data) {
      List<String> users = List<String>.from(data);
      onlineUsers = Set<String>.from(users);
      notifyListeners(); // If using ChangeNotifier
    });
    
    socket.on('user_status_change', (data) {
      if (data['status'] == 'online') {
        onlineUsers.add(data['userId']);
      } else {
        onlineUsers.remove(data['userId']);
      }
      notifyListeners(); // If using ChangeNotifier
    });
    
    socket.onDisconnect((_) {
      print('Disconnected from chat server');
    });
  }
  
  bool isUserOnline(String userId) {
    return onlineUsers.contains(userId);
  }
  
  void joinChat(String chatId) {
    socket.emit('join_chat', chatId);
  }
  
  void sendMessage(String chatId, String content) {
    socket.emit('send_message', {
      'chatId': chatId,
      'content': content
    });
  }
  
  void setTypingStatus(String chatId, bool isTyping) {
    socket.emit('typing', {
      'chatId': chatId,
      'isTyping': isTyping
    });
  }
  
  void disconnect() {
    socket.disconnect();
  }
}
```

## Important Notes

1. **Authentication**: Always include the JWT token in the connection query
2. **Connection Lifecycle**: 
   - Connect when the user logs in or opens the chat
   - Disconnect when the user logs out or closes the app
3. **Chat Rooms**: 
   - Join a chat room when opening a specific chat
   - Leave when navigating away
4. **Error Handling**: 
   - Handle connection errors gracefully
   - Implement reconnection logic
5. **Message Flow**:
   - Send message → Server acknowledges → Message appears in chat for all participants
6. **Online Status**:
   - The server tracks online users automatically
   - Your app receives updates when users connect/disconnect
   - Use the `onlineUsers` set to check if a user is online

## Available Events

| Event to Listen For | Description |
|---------------------|-------------|
| `connection_success` | Successful connection with user info |
| `chat_joined` | Successfully joined a chat room |
| `chat_message` | New message in a chat room |
| `message_received` | Acknowledgment of sent message |
| `user_typing` | User typing indicator |
| `online_users` | List of all currently online users |
| `user_status_change` | Real-time user online/offline updates |
| `error` | Error information |

| Event to Emit | Description |
|---------------|-------------|
| `join_chat` | Join a chat room |
| `leave_chat` | Leave a chat room |
| `send_message` | Send a message |
| `typing` | Send typing status |

This implementation matches our working React version and should provide all the functionality needed for the chat feature in your Flutter app.
