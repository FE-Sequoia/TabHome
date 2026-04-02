/**
 * TabHome 大宝标签管理器 v2.0
 * Chrome 浏览器标签管理插件
 * 功能：新标签页替换、标签分组管理、数据本地存储、Apple 极简风格 UI
 */

/**
 * 全局变量
 * currentData: 当前标签数据
 * currentCategoryId: 当前选中的分组 ID
 * currentEditTab: 当前正在编辑的标签
 * currentEditCategory: 当前正在编辑的分组
 * confirmCallback: 确认对话框的回调函数
 * searchTimeout: 搜索防抖定时器
 * contextMenuTarget: 右键菜单的目标分组 ID
 */
let currentData = { categories: [] };
let currentCategoryId = null;
let currentEditTab = null;
let currentEditCategory = null;
let confirmCallback = null;
let searchTimeout = null;
let contextMenuTarget = null;

/**
 * 初始化应用
 */
async function init() {
    await loadData();
    renderCategoryList();
    selectCategory(currentData.categories[0]?.id || null);
    bindEvents();
}

/**
 * 检测是否在 Chrome 扩展环境中
 */
function isChromeExtension() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

/**
 * 加载数据
 * 从 chrome.storage.local 或 localStorage 加载数据
 */
async function loadData() {
    try {
        if (isChromeExtension()) {
            // Chrome 扩展环境
            const result = await chrome.storage.local.get('tabhubData');
            if (result.tabhubData) {
                currentData = result.tabhubData;
            } else {
                await loadDefaultData();
            }
        } else {
            // 普通浏览器环境，使用 localStorage
            const stored = localStorage.getItem('tabhubData');
            if (stored) {
                currentData = JSON.parse(stored);
            } else {
                await loadDefaultData();
            }
        }
    } catch (error) {
        console.error('加载数据失败:', error);
        await loadDefaultData();
    }
}

/**
 * 加载默认数据
 */
async function loadDefaultData() {
    try {
        const response = await fetch('tabs.json');
        const defaultData = await response.json();
        currentData = defaultData;
        await saveData();
    } catch (error) {
        console.error('加载默认数据失败:', error);
        // 使用硬编码默认数据
        currentData = {
            categories: [
                {
                    id: '1',
                    name: '常用工具',
                    tabs: [
                        { id: '1-1', name: 'Google', url: 'https://www.google.com', icon: 'https://www.google.com/favicon.ico' },
                        { id: '1-2', name: 'GitHub', url: 'https://github.com', icon: 'https://github.com/favicon.ico' }
                    ]
                }
            ]
        };
        await saveData();
    }
}

/**
 * 保存数据
 * 将数据保存到 chrome.storage.local 或 localStorage
 */
async function saveData() {
    try {
        if (isChromeExtension()) {
            await chrome.storage.local.set({ tabhubData: currentData });
        } else {
            localStorage.setItem('tabhubData', JSON.stringify(currentData));
        }
    } catch (error) {
        console.error('保存数据失败:', error);
    }
}

/**
 * 渲染分组列表
 */
function renderCategoryList() {
    const categoryList = document.getElementById('categoryList');
    const fragment = document.createDocumentFragment();

    // 添加"全部标签"选项
    const allItem = document.createElement('div');
    allItem.className = 'category-item' + (currentCategoryId === null ? ' active' : '');
    allItem.dataset.categoryId = '';
    allItem.innerHTML = `
        <div class="category-icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <rect x="8" y="2" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <rect x="2" y="8" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
                <rect x="8" y="8" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/>
            </svg>
        </div>
        <span class="category-name">全部标签</span>
        <span class="category-count">${getTotalTabCount()}</span>
    `;
    fragment.appendChild(allItem);

    // 渲染各个分组
    currentData.categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'category-item' + (category.id === currentCategoryId ? ' active' : '');
        item.dataset.categoryId = category.id;
        item.innerHTML = `
            <div class="category-icon">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4C2 2.89543 2.89543 2 4 2H6L8 4H12C13.1046 4 14 4.89543 14 6V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V4Z" stroke="currentColor" stroke-width="1.5"/>
                </svg>
            </div>
            <span class="category-name">${escapeHtml(category.name)}</span>
            <span class="category-count">${category.tabs.length}</span>
        `;
        fragment.appendChild(item);
    });

    categoryList.innerHTML = '';
    categoryList.appendChild(fragment);
}

/**
 * 获取标签总数
 */
function getTotalTabCount() {
    return currentData.categories.reduce((sum, cat) => sum + cat.tabs.length, 0);
}

/**
 * 选择分组
 */
function selectCategory(categoryId) {
    currentCategoryId = categoryId;
    renderCategoryList();
    renderTabs();
    updateHeader();
}

/**
 * 更新头部信息
 */
function updateHeader() {
    const currentCategoryName = document.getElementById('currentCategoryName');
    const tabCount = document.getElementById('tabCount');

    if (currentCategoryId === null) {
        currentCategoryName.textContent = '全部标签';
        tabCount.textContent = `${getTotalTabCount()} 个标签`;
    } else {
        const category = currentData.categories.find(c => c.id === currentCategoryId);
        if (category) {
            currentCategoryName.textContent = category.name;
            tabCount.textContent = `${category.tabs.length} 个标签`;
        }
    }
}

/**
 * 渲染标签卡片
 * 1. 获取搜索关键词
 * 2. 根据当前选中的分组获取标签列表
 * 3. 应用搜索过滤
 * 4. 显示空状态或标签卡片
 * 5. 使用 DocumentFragment 批量渲染，提高性能
 */
function renderTabs() {
    const tabsGrid = document.getElementById('tabsGrid');
    const emptyState = document.getElementById('emptyState');
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    let tabs = [];

    if (currentCategoryId === null) {
        // 显示所有标签
        currentData.categories.forEach(category => {
            category.tabs.forEach(tab => {
                tabs.push({ ...tab, categoryId: category.id, categoryName: category.name });
            });
        });
    } else {
        // 显示选中分组的标签
        const category = currentData.categories.find(c => c.id === currentCategoryId);
        if (category) {
            tabs = category.tabs.map(tab => ({ ...tab, categoryId: category.id, categoryName: category.name }));
        }
    }

    // 搜索过滤
    if (searchQuery) {
        tabs = tabs.filter(tab =>
            tab.name.toLowerCase().includes(searchQuery) ||
            tab.url.toLowerCase().includes(searchQuery)
        );
    }

    // 显示或隐藏空状态
    if (tabs.length === 0) {
        tabsGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    tabsGrid.style.display = 'grid';
    emptyState.style.display = 'none';

    // 使用 DocumentFragment 批量渲染，减少 DOM 操作次数，提高性能
    const fragment = document.createDocumentFragment();
    tabs.forEach((tab, index) => {
        const card = createTabCard(tab, index);
        fragment.appendChild(card);
    });

    tabsGrid.innerHTML = '';
    tabsGrid.appendChild(fragment);
}

/**
 * 创建标签卡片
 * @param {Object} tab - 标签数据
 * @param {number} index - 标签索引，用于动画延迟
 * @returns {HTMLElement} 标签卡片元素
 * 
 * 功能：
 * 1. 创建卡片 DOM 元素
 * 2. 生成卡片内容，包括图标、名称、域名、描述
 * 3. 为 favicon 添加错误处理
 * 4. 添加点击事件，打开链接
 */
function createTabCard(tab, index) {
    const card = document.createElement('div');
    card.className = 'tab-card';
    card.dataset.tabId = tab.id;
    card.dataset.categoryId = tab.categoryId;
    card.style.animationDelay = `${index * 0.03}s`; // 为每个卡片添加不同的动画延迟

    const domain = getDomainFromUrl(tab.url);
    const defaultIcon = tab.name.charAt(0).toUpperCase(); // 使用标签名称的首字母作为默认图标

    // 生成卡片 HTML 结构
    card.innerHTML = `
        <div class="tab-card-header">
            <img class="tab-favicon-img" src="${tab.icon || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`}" alt="">
            <div class="tab-favicon-default" style="display: ${tab.icon ? 'none' : 'flex'}">${defaultIcon}</div>
            <div class="tab-info">
                <div class="tab-name">${escapeHtml(tab.name)}</div>
                <div class="tab-meta">
                    <span class="tab-url">${escapeHtml(domain)}</span>
                    ${tab.description ? `<span class="tab-description" title="${escapeHtml(tab.description)}">${escapeHtml(tab.description)}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="tab-actions">
            <button class="tab-action-btn edit-tab" title="编辑" data-tab-id="${tab.id}" data-category-id="${tab.categoryId}">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2H4C2.89543 2 2 2.89543 2 4V12C2 13.1046 2.89543 14 4 14H12C13.1046 14 14 13.1046 14 12V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M12 2L14 4L8 10H6V8L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <button class="tab-action-btn delete delete-tab" title="删除" data-tab-id="${tab.id}" data-category-id="${tab.categoryId}">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4H14M12 4V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V4M6 4V3C6 2.44772 6.44772 2 7 2H9C9.55228 2 10 2.44772 10 3V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;

    // 为 favicon 图片添加错误处理，当图片加载失败时显示默认图标
    const faviconImg = card.querySelector('.tab-favicon-img');
    const defaultIconEl = card.querySelector('.tab-favicon-default');
    
    if (faviconImg) {
        faviconImg.addEventListener('error', function() {
            this.style.display = 'none';
            if (defaultIconEl) {
                defaultIconEl.style.display = 'flex';
            }
        });
    }

    // 点击卡片打开链接（排除点击操作按钮的情况）
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-actions')) {
            window.open(tab.url, '_blank');
        }
    });

    return card;
}

/**
 * 从 URL 获取域名
 */
function getDomainFromUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 分组列表点击
    document.getElementById('categoryList').addEventListener('click', (e) => {
        const item = e.target.closest('.category-item');
        if (item) {
            const categoryId = item.dataset.categoryId;
            selectCategory(categoryId || null);
        }
    });

    // 分组右键菜单
    document.getElementById('categoryList').addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.category-item');
        if (item && item.dataset.categoryId) {
            e.preventDefault();
            showContextMenu(e, item.dataset.categoryId);
        }
    });

    // 搜索框（带防抖处理）
    document.getElementById('searchInput').addEventListener('input', () => {
        // 清除之前的定时器，防止频繁触发搜索
        clearTimeout(searchTimeout);
        // 200ms 防抖，提高性能
        searchTimeout = setTimeout(renderTabs, 200);
    });

    // 添加标签按钮
    document.getElementById('addTabBtn').addEventListener('click', () => {
        openTabModal();
    });

    // 添加分组按钮
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
        openCategoryModal();
    });

    // 导入导出
    document.getElementById('importBtn').addEventListener('click', importData);
    document.getElementById('exportBtn').addEventListener('click', exportData);

    // 标签对话框
    document.getElementById('tabModalClose').addEventListener('click', closeTabModal);
    document.getElementById('tabModalCancel').addEventListener('click', closeTabModal);
    document.getElementById('tabModalSave').addEventListener('click', saveTab);

    // 分组对话框
    document.getElementById('categoryModalClose').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryModalCancel').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryModalSave').addEventListener('click', saveCategory);

    // 确认对话框
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirmOk').addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
        closeConfirmModal();
    });

    // 点击遮罩关闭对话框
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => {
            closeTabModal();
            closeCategoryModal();
            closeConfirmModal();
        });
    });

    // 标签卡片操作（事件委托）
    document.getElementById('tabsGrid').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-tab');
        const deleteBtn = e.target.closest('.delete-tab');

        if (editBtn) {
            e.stopPropagation();
            const tabId = editBtn.dataset.tabId;
            const categoryId = editBtn.dataset.categoryId;
            editTab(categoryId, tabId);
        } else if (deleteBtn) {
            e.stopPropagation();
            const tabId = deleteBtn.dataset.tabId;
            const categoryId = deleteBtn.dataset.categoryId;
            deleteTab(categoryId, tabId);
        }
    });

    // 右键菜单操作
    document.getElementById('categoryContextMenu').addEventListener('click', (e) => {
        const item = e.target.closest('.context-item');
        if (item && contextMenuTarget) {
            const action = item.dataset.action;
            const categoryId = contextMenuTarget;

            switch (action) {
                case 'rename':
                    editCategory(categoryId);
                    break;
                case 'moveUp':
                    moveCategory(categoryId, -1);
                    break;
                case 'moveDown':
                    moveCategory(categoryId, 1);
                    break;
                case 'delete':
                    deleteCategory(categoryId);
                    break;
            }
            hideContextMenu();
        }
    });

    // 点击其他地方关闭右键菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });

    // ESC 关闭对话框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTabModal();
            closeCategoryModal();
            closeConfirmModal();
            hideContextMenu();
        }
    });
}

/**
 * 显示右键菜单
 */
function showContextMenu(e, categoryId) {
    contextMenuTarget = categoryId;
    const menu = document.getElementById('categoryContextMenu');

    // 计算菜单位置
    let x = e.clientX;
    let y = e.clientY;

    // 防止菜单超出视口
    const menuRect = menu.getBoundingClientRect();
    if (x + menuRect.width > window.innerWidth) {
        x = window.innerWidth - menuRect.width - 10;
    }
    if (y + menuRect.height > window.innerHeight) {
        y = window.innerHeight - menuRect.height - 10;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('show');
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    const menu = document.getElementById('categoryContextMenu');
    menu.classList.remove('show');
    contextMenuTarget = null;
}

/**
 * 移动分组
 */
async function moveCategory(categoryId, direction) {
    const index = currentData.categories.findIndex(c => c.id === categoryId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentData.categories.length) return;

    // 交换位置
    [currentData.categories[index], currentData.categories[newIndex]] =
    [currentData.categories[newIndex], currentData.categories[index]];

    await saveData();
    renderCategoryList();
}

/**
 * 打开标签对话框
 */
function openTabModal(tab = null, categoryId = null) {
    currentEditTab = tab;
    const modal = document.getElementById('tabModal');
    const title = document.getElementById('tabModalTitle');
    const categorySelect = document.getElementById('tabCategory');

    // 重置表单
    document.getElementById('tabForm').reset();

    // 填充分组选项
    categorySelect.innerHTML = '';
    currentData.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });

    if (tab) {
        title.textContent = '编辑标签';
        document.getElementById('tabName').value = tab.name;
        document.getElementById('tabUrl').value = tab.url;
        document.getElementById('tabIcon').value = tab.icon || '';
        document.getElementById('tabDescription').value = tab.description || '';
        document.getElementById('tabCategory').value = categoryId || currentCategoryId || currentData.categories[0]?.id;
    } else {
        title.textContent = '添加标签';
        document.getElementById('tabCategory').value = currentCategoryId || currentData.categories[0]?.id;
    }

    modal.classList.add('show');
    document.getElementById('tabName').focus();
}

/**
 * 关闭标签对话框
 */
function closeTabModal() {
    const modal = document.getElementById('tabModal');
    modal.classList.remove('show');
    currentEditTab = null;
}

/**
 * 保存标签
 */
async function saveTab() {
    const name = document.getElementById('tabName').value.trim();
    let url = document.getElementById('tabUrl').value.trim();
    const icon = document.getElementById('tabIcon').value.trim();
    const description = document.getElementById('tabDescription').value.trim();
    const categoryId = document.getElementById('tabCategory').value;

    if (!name || !url || !categoryId) {
        showToast('请填写完整信息');
        return;
    }

    // 确保 URL 格式正确
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    if (currentEditTab) {
        // 编辑现有标签
        let originalCategory = null;
        let tabToUpdate = null;

        for (const category of currentData.categories) {
            const tab = category.tabs.find(t => t.id === currentEditTab.id);
            if (tab) {
                originalCategory = category;
                tabToUpdate = tab;
                break;
            }
        }

        if (tabToUpdate) {
            tabToUpdate.name = name;
            tabToUpdate.url = url;
            tabToUpdate.icon = icon;
            tabToUpdate.description = description;

            // 如果分组发生变化，移动标签
            if (originalCategory.id !== categoryId) {
                originalCategory.tabs = originalCategory.tabs.filter(t => t.id !== currentEditTab.id);
                const newCategory = currentData.categories.find(c => c.id === categoryId);
                if (newCategory) {
                    newCategory.tabs.push(tabToUpdate);
                }
            }
        }
    } else {
        // 添加新标签
        const category = currentData.categories.find(c => c.id === categoryId);
        if (category) {
            const newTab = {
                id: `${categoryId}-${Date.now()}`,
                name: name,
                url: url,
                icon: icon,
                description: description
            };
            category.tabs.push(newTab);
        }
    }

    await saveData();
    renderCategoryList();
    renderTabs();
    updateHeader();
    closeTabModal();
}

/**
 * 编辑标签
 */
function editTab(categoryId, tabId) {
    const category = currentData.categories.find(c => c.id === categoryId);
    if (category) {
        const tab = category.tabs.find(t => t.id === tabId);
        if (tab) {
            openTabModal(tab, categoryId);
        }
    }
}

/**
 * 删除标签
 */
function deleteTab(categoryId, tabId) {
    confirmCallback = async () => {
        const category = currentData.categories.find(c => c.id === categoryId);
        if (category) {
            category.tabs = category.tabs.filter(t => t.id !== tabId);
            await saveData();
            renderCategoryList();
            renderTabs();
            updateHeader();
        }
    };

    document.getElementById('confirmMessage').textContent = '确定要删除此标签吗？';
    document.getElementById('confirmModal').classList.add('show');
}

/**
 * 打开分组对话框
 */
function openCategoryModal(category = null) {
    currentEditCategory = category;
    const modal = document.getElementById('categoryModal');
    const title = document.getElementById('categoryModalTitle');

    document.getElementById('categoryForm').reset();

    if (category) {
        title.textContent = '重命名分组';
        document.getElementById('categoryName').value = category.name;
    } else {
        title.textContent = '添加分组';
    }

    modal.classList.add('show');
    document.getElementById('categoryName').focus();
}

/**
 * 关闭分组对话框
 */
function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    modal.classList.remove('show');
    currentEditCategory = null;
}

/**
 * 保存分组
 */
async function saveCategory() {
    const name = document.getElementById('categoryName').value.trim();

    if (!name) {
        showToast('请填写分组名称');
        return;
    }

    if (currentEditCategory) {
        currentEditCategory.name = name;
    } else {
        const newCategory = {
            id: Date.now().toString(),
            name: name,
            tabs: []
        };
        currentData.categories.push(newCategory);
    }

    await saveData();
    renderCategoryList();
    closeCategoryModal();
}

/**
 * 编辑分组
 */
function editCategory(categoryId) {
    const category = currentData.categories.find(c => c.id === categoryId);
    if (category) {
        openCategoryModal(category);
    }
}

/**
 * 删除分组
 */
function deleteCategory(categoryId) {
    confirmCallback = async () => {
        currentData.categories = currentData.categories.filter(c => c.id !== categoryId);
        if (currentCategoryId === categoryId) {
            currentCategoryId = null;
        }
        await saveData();
        renderCategoryList();
        selectCategory(currentCategoryId);
    };

    document.getElementById('confirmMessage').textContent = '确定要删除此分组吗？分组内的所有标签也会被删除。';
    document.getElementById('confirmModal').classList.add('show');
}

/**
 * 关闭确认对话框
 */
function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    confirmCallback = null;
}

/**
 * 导入数据
 */
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.categories && Array.isArray(data.categories)) {
                        currentData = data;
                        await saveData();
                        renderCategoryList();
                        selectCategory(currentData.categories[0]?.id || null);
                        showToast('导入成功');
                    } else {
                        showToast('导入失败：数据格式错误');
                    }
                } catch (error) {
                    showToast('导入失败：JSON 格式错误');
                    console.error('导入失败:', error);
                }
            };
            reader.readAsText(file);
        }
    };

    input.click();
}

/**
 * 导出数据
 */
function exportData() {
    const dataStr = JSON.stringify(currentData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tabhome-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('导出成功');
}

/**
 * 显示提示消息
 */
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background-color: rgba(28, 28, 31, 0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 2000;
        transition: transform 0.3s ease;
        backdrop-filter: blur(10px);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    init();
});
