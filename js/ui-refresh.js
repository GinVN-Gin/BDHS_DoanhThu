(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const modal = $('#settingsHubModal');
  const content = $('#settingsHubContent');
  const menu = $('#settingsHubMenu');
  const title = $('#settingsHubTitle');
  const source = $('#settingsPanelsSource');
  if (!modal || !content || !menu || !source) return;

  const panels = {};
  $$('[data-settings-panel-id]', source).forEach((panel) => {
    panels[panel.dataset.settingsPanelId] = panel;
    if (panel.tagName === 'DETAILS') panel.open = true;
  });

  const panelTitles = {
    identity: 'Thông tin chi nhánh', buyer: 'Thông tin người mua hàng',
    home: 'Giao diện Home', 'app-theme': 'Theme & giao diện ứng dụng',
    background: 'Hình nền', 'order-design': 'Phiếu đặt hàng', excel: 'Mẫu Excel tháng',
    cloud: 'Đồng bộ Cloud', backup: 'Sao lưu dữ liệu'
  };
  const groups = {
    account: {
      title: 'Tài khoản & chi nhánh',
      items: [
        ['identity', '◌', 'Thông tin chi nhánh', 'Tên hiển thị trên app, Excel và phiếu'],
        ['buyer', '⌁', 'Người mua hàng', 'Giao hàng, VAT, ngân hàng và ghi chú']
      ]
    },
    appearance: {
      title: 'Giao diện',
      items: [
        ['app-theme', '◇', 'Theme ứng dụng', 'Business, One UI, iOS, Dark và màu khác'],
        ['home', '▦', 'Giao diện Home', 'Kích thước, số cột, bo góc và độ bóng'],
        ['background', '▧', 'Hình nền', 'Ảnh nền và độ rõ']
      ]
    }
  };

  function returnCurrentPanel() {
    const current = content.firstElementChild;
    if (current && current.dataset.settingsPanelId) source.querySelector('.settings-grid').appendChild(current);
    content.replaceChildren();
  }
  function showModal() {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    returnCurrentPanel();
    menu.classList.add('hidden');
    menu.replaceChildren();
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  function openPanel(id) {
    const panel = panels[id];
    if (!panel) return;
    returnCurrentPanel();
    menu.classList.add('hidden');
    menu.replaceChildren();
    title.textContent = panelTitles[id] || 'Cài đặt';

    // Các panel dạng <details> có thể bị app.js đóng khi panel khác mở.
    // Luôn mở lại panel ngay trước và sau khi đưa vào popup để nội dung hiển thị.
    if (panel.tagName === 'DETAILS') panel.open = true;
    panel.hidden = false;
    panel.style.display = 'block';
    content.appendChild(panel);
    if (panel.tagName === 'DETAILS') panel.open = true;

    showModal();
  }
  function openGroup(id) {
    const group = groups[id];
    if (!group) return;
    returnCurrentPanel();
    title.textContent = group.title;
    menu.replaceChildren(...group.items.map(([panelId, icon, name, note]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-subtile';
      button.innerHTML = `<span>${icon}</span><b>${name}</b><small>${note}</small>`;
      button.addEventListener('click', () => openPanel(panelId));
      return button;
    }));
    menu.classList.remove('hidden');
    showModal();
  }

  $$('[data-settings-panel]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.settingsPanel)));
  $$('[data-settings-group]').forEach((button) => button.addEventListener('click', () => openGroup(button.dataset.settingsGroup)));
  $('#settingsHubClose')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
})();
