(function () {
  const container = document.getElementById('tracker');
  let maxIcons = 8;

  function connect() {
    const socket = new WebSocket(`ws://${location.host}/ws`);
    socket.addEventListener('message', (raw) => {
      const message = JSON.parse(raw.data);
      if (message.type === 'settings') {
        maxIcons = message.settings.iconCount ?? maxIcons;
        applyTheme(message.settings.theme);
      } else if (message.type === 'cast') {
        addIcon(message.event);
      }
    });
    // If the app restarts (e.g. profile reload), reconnect automatically
    // rather than leaving OBS's browser source showing a dead overlay.
    socket.addEventListener('close', () => setTimeout(connect, 1000));
    socket.addEventListener('error', () => socket.close());
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme || 'dark';
  }

  function addIcon(event) {
    const icon = document.createElement('div');
    icon.className = 'tracker-icon';
    icon.title = event.action;

    // event.icon is a filename (e.g. "bloodbarrage.webp") or, for dyed
    // weapons, a subfolder-qualified path (e.g. "dyed/foo.png") - encode
    // each path segment separately so a "/" stays a real path separator
    // instead of becoming %2F, which the static file server won't resolve.
    if (event.icon) {
      const encodedPath = event.icon.split('/').map(encodeURIComponent).join('/');
      icon.style.backgroundImage = `url("/data/icons/${encodedPath}")`;
    } else {
      icon.textContent = event.action;
    }

    container.prepend(icon);

    while (container.children.length > maxIcons) {
      container.lastElementChild.remove();
    }
  }

  connect();
})();
