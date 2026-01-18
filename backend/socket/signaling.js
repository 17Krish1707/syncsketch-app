// Store ended meeting IDs in memory
const endedMeetings = new Set();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
      // 1. CHECK IF MEETING IS ENDED
      if (endedMeetings.has(roomId)) {
        socket.emit("meeting-ended-error"); // Reject the user
        return;
      }

      socket.join(roomId);
      socket.to(roomId).emit("user-connected", {
        id: socket.id,
        user,
      });
    });

    socket.on("offer", ({ target, sdp }) => {
      io.to(target).emit("offer", {
        from: socket.id,
        sdp,
      });
    });

    socket.on("answer", ({ target, sdp }) => {
      io.to(target).emit("answer", {
        from: socket.id,
        sdp,
      });
    });

    socket.on("ice-candidate", ({ target, candidate }) => {
      io.to(target).emit("ice-candidate", {
        from: socket.id,
        candidate,
      });
    });

    socket.on("new_message", (msg) => {
      socket.broadcast.emit("new_message", msg);
    });

    socket.on("board_op", (op) => {
      socket.broadcast.emit("board_op", op);
    });

    socket.on("board_undo", (data) => {
      socket.broadcast.emit("board_undo", data);
    });

    socket.on("cursor_moved", (data) => {
      socket.broadcast.emit("cursor_moved", data);
    });

    socket.on("meeting_state_sync", (state) => {
      socket.broadcast.emit("meeting_state_sync", state);
    });

    socket.on("presence_ping", (user) => {
      socket.broadcast.emit("presence_ping", user);
    });

    socket.on("presence_pong", (user) => {
      socket.broadcast.emit("presence_pong", user);
    });

    socket.on("new_file", (file) => {
      socket.broadcast.emit("new_file", file);
    });

    socket.on("admin-action", ({ type, targetId }) => {
      if (type === 'kick') io.to(targetId).emit('admin-kick');
      if (type === 'mute') io.to(targetId).emit('admin-mute');
    });

    // 2. MARK MEETING AS ENDED
    socket.on("end_meeting", (roomId) => {
      endedMeetings.add(roomId); // Add to blocklist
      io.to(roomId).emit("meeting_ended_globally");
      
      // Optional: Clear memory after 24 hours to prevent memory leaks
      setTimeout(() => endedMeetings.delete(roomId), 24 * 60 * 60 * 1000);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      socket.broadcast.emit("user-disconnected", socket.id);
    });
  });
};