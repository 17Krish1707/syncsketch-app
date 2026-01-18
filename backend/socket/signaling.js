module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
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

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      socket.broadcast.emit("user-disconnected", socket.id);
    });
  });
};
