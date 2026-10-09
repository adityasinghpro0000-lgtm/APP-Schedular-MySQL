/* Profile picker and profile persistence for the APP Project. */
(function() {
  const STORAGE_KEYS = {
    profile: 'cpu-simulator-profile',
    profiles: 'cpu-simulator-profiles'
  };
  const DEFAULT_PROFILE = { id: 'default', name: 'AK', role: 'Project user', active: true, avatar: '' };
  let activeProfileMenuId = null;

  function ensureProfiles() {
    const saved = localStorage.getItem(STORAGE_KEYS.profiles);
    if (!saved) {
      const defaultProfile = { ...DEFAULT_PROFILE };
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify([defaultProfile]));
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(defaultProfile));
      return [defaultProfile];
    }
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) {
      // Recover from malformed profile data.
    }
    const fallback = [{ ...DEFAULT_PROFILE }];
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(fallback));
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(fallback[0]));
    return fallback;
  }

  function getProfiles() {
    const profiles = ensureProfiles();
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    if (activeProfile) localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(activeProfile));
    return profiles;
  }

  function readProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || 'null');
      if (saved && typeof saved.name === 'string') return { ...DEFAULT_PROFILE, ...saved };
    } catch (_) {
      // Recover through the saved profile collection below.
    }
    return getProfiles()[0] || { ...DEFAULT_PROFILE };
  }

  function writeProfile(profile) {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }

  function getInitials(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return 'AK';
    return cleaned.split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'AK';
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function promptForInput(message, defaultValue) {
    if (typeof window.prompt !== 'function') return defaultValue;
    try {
      return window.prompt(message, defaultValue);
    } catch (_) {
      return defaultValue;
    }
  }

  function getProfileAvatarMarkup(profile) {
    if (profile?.avatar) {
      return `<span class="profile-card-avatar-image" aria-label="${escapeHTML(profile.name)} profile photo" style="background-image:url('${profile.avatar}'); background-size:cover; background-position:center;"></span>`;
    }
    return `<span class="profile-card-badge">${getInitials(profile?.name)}</span>`;
  }

  function refreshProfileUI() {
    const profile = readProfile();
    const profileToggle = document.querySelector('#profileToggle');
    const profileName = document.querySelector('#profileName');
    const profileRole = document.querySelector('#profileRole');
    const profileBadge = document.querySelector('#profileBadge');
    const profileList = document.querySelector('#profileList');

    if (profileToggle) {
      profileToggle.textContent = profile.avatar ? '' : getInitials(profile.name);
      if (profileToggle.style) {
        profileToggle.style.backgroundImage = profile.avatar ? `url('${profile.avatar}')` : '';
        profileToggle.style.backgroundSize = 'cover';
        profileToggle.style.backgroundPosition = 'center';
      }
      profileToggle.setAttribute('title', `${profile.name} profile`);
      profileToggle.setAttribute('aria-label', `${profile.name} profile`);
    }
    if (profileName) profileName.textContent = profile.name;
    if (profileRole) profileRole.textContent = profile.role;
    if (profileBadge) {
      profileBadge.innerHTML = profile.avatar ? `<span class="profile-badge-image" aria-label="${escapeHTML(profile.name)} profile photo" style="background-image:url('${profile.avatar}'); background-size:cover; background-position:center;"></span>` : getInitials(profile.name);
    }

    if (profileList) {
      const profiles = getProfiles();
      profileList.innerHTML = profiles.map(item => `
        <div class="profile-card ${item.active ? 'active' : ''}" role="listitem" tabindex="0" data-profile-id="${item.id}" aria-label="${escapeHTML(item.name)} profile${item.active ? ', active' : ''}">
          <button type="button" class="profile-card-menu" data-profile-menu="${item.id}" aria-label="More actions for ${escapeHTML(item.name)}" title="Profile options">
            <i data-lucide="more-vertical"></i>
          </button>
          <div class="profile-card-menu-panel" data-menu-panel="${item.id}" hidden>
            <button type="button" class="profile-card-menu-action" data-profile-action="photo"><i data-lucide="image-plus"></i><span>Set custom photo</span></button>
            <button type="button" class="profile-card-menu-action" data-profile-action="remove-photo"><i data-lucide="image-off"></i><span>Remove photo</span></button>
            <button type="button" class="profile-card-menu-action danger" data-profile-action="delete"><i data-lucide="trash-2"></i><span>Delete profile</span></button>
            <input type="file" class="profile-photo-input" accept="image/*" hidden />
          </div>
          <span class="profile-card-name" data-profile-name="${item.id}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(item.name)} profile name">${escapeHTML(item.name)}</span>
          ${getProfileAvatarMarkup(item)}
          <span class="profile-card-role">${escapeHTML(item.role)}</span>
          ${item.active ? '<span class="profile-card-active">Active</span>' : ''}
        </div>
      `).join('') + `
        <button type="button" class="profile-card profile-add" id="profileAddCard" role="listitem" aria-label="Add profile">
          <span class="profile-card-badge">+</span>
          <span class="profile-card-name">Add profile</span>
        </button>
      `;
      profileList.querySelectorAll('[data-profile-id]').forEach(button => {
        const selectProfile = () => setActiveProfile(button.dataset.profileId);
        button.addEventListener('click', event => {
          if (event.target.closest('[data-profile-menu]') || event.target.closest('[data-menu-panel]') || event.target.closest('[data-profile-action]')) return;
          selectProfile();
        });
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectProfile(); }
        });
      });
      profileList.querySelectorAll('[data-profile-name]').forEach(nameElement => {
        const startEditing = event => {
          event.preventDefault();
          event.stopPropagation();
          if (nameElement.querySelector('input')) return;
          const profileId = nameElement.dataset.profileName;
          const currentName = getProfiles().find(profile => profile.id === profileId)?.name || nameElement.textContent;
          const input = document.createElement('input');
          input.className = 'profile-card-name-input';
          input.value = currentName;
          input.setAttribute('aria-label', 'Edit profile name');
          nameElement.textContent = '';
          nameElement.appendChild(input);
          input.focus();
          input.select();
          let cancelled = false;
          const finish = () => {
            if (cancelled) return;
            const nextName = input.value.trim();
            if (nextName) updateProfile(profileId, profile => ({ ...profile, name: nextName }));
            else refreshProfileUI();
          };
          input.addEventListener('blur', finish, { once: true });
          input.addEventListener('keydown', keyEvent => {
            keyEvent.stopPropagation();
            if (keyEvent.key === 'Enter') input.blur();
            if (keyEvent.key === 'Escape') { cancelled = true; refreshProfileUI(); }
          });
        };
        nameElement.addEventListener('click', startEditing);
        nameElement.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') startEditing(event);
        });
      });
      profileList.querySelectorAll('[data-profile-menu]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const id = button.dataset.profileMenu;
          const panel = profileList.querySelector(`[data-menu-panel="${id}"]`);
          if (!panel) return;
          const isOpen = !panel.hidden;
          closeProfileMenu();
          if (!isOpen) {
            panel.hidden = false;
            activeProfileMenuId = id;
          }
        });
      });
      profileList.querySelectorAll('[data-profile-action]').forEach(action => {
        action.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const panel = action.closest('[data-menu-panel]');
          const profileId = panel?.dataset.menuPanel || readProfile().id;
          const actionName = action.dataset.profileAction;
          if (actionName === 'rename') renameProfile(profileId);
          if (actionName === 'photo') {
            const input = panel?.querySelector('.profile-photo-input');
            input?.click();
          }
          if (actionName === 'remove-photo') removeProfilePhoto(profileId);
          if (actionName === 'delete') {
            const target = getProfiles().find(item => item.id === profileId);
            if (!target) return;
            if (getProfiles().length <= 1) {
              closeProfileMenu();
              showProfileStatus('Keep at least one profile');
              return;
            }
            if (!window.confirm(`Delete the ${target.name} profile?`)) return;
            if (deleteProfile(profileId)) {
              refreshProfileUI();
              showProfileStatus(`Profile deleted: ${target.name}`);
              closeProfileMenu();
            }
          }
        });
      });
      profileList.querySelectorAll('.profile-photo-input').forEach(input => {
        input.addEventListener('change', event => {
          const profileId = event.target.closest('[data-menu-panel]')?.dataset.menuPanel || readProfile().id;
          const file = event.target.files && event.target.files[0];
          if (file) setProfilePhoto(profileId, file);
          event.target.value = '';
        });
      });
      profileList.querySelector('#profileAddCard')?.addEventListener('click', () => {
        const name = promptForInput('Create a new profile name:', 'New Profile');
        if (name !== null && createProfile(name)) showProfileStatus(`Profile created: ${name.trim()}`);
      });
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function setActiveProfile(profileId) {
    const profiles = getProfiles().map(profile => ({ ...profile, active: profile.id === profileId }));
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
    writeProfile(activeProfile);
    localStorage.removeItem(`cpu-simulator-active-workspace-${activeProfile.id}`);
    if (window.location?.pathname?.endsWith('profile.html')) window.location.href = 'workspace.html';
    else refreshProfileUI();
  }

  function updateProfile(profileId, updater) {
    const profiles = getProfiles().map(profile => profile.id === profileId ? updater(profile) : profile);
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    if (activeProfile) writeProfile(activeProfile);
    refreshProfileUI();
    return true;
  }

  function closeProfileMenu() {
    document.querySelectorAll('[data-menu-panel]').forEach(panel => {
      panel.hidden = true;
    });
    activeProfileMenuId = null;
  }

  function createProfile(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return null;
    const nextProfile = { id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, name: cleaned, role: 'Project user', active: true };
    const profiles = getProfiles().map(profile => ({ ...profile, active: false }));
    profiles.push(nextProfile);
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
    writeProfile(nextProfile);
    refreshProfileUI();
    return nextProfile;
  }

  function deleteProfile(profileId) {
    const profiles = getProfiles();
    if (profiles.length <= 1) return false;
    const target = profiles.find(profile => profile.id === profileId);
    if (!target) return false;
    const remaining = profiles.filter(profile => profile.id !== profileId);
    if (target.active) remaining[0].active = true;
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(remaining));
    writeProfile(remaining.find(profile => profile.active));
    clearProfileWorkspaceData(profileId);
    return true;
  }

  function clearProfileWorkspaceData(profileId) {
    const prefixes = [
      `cpu-simulator-tabs-${profileId}`,
      `cpu-simulator-active-workspace-${profileId}`,
      `cpu-sim-ws-v3-${profileId}-`
    ];
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key && prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
  }

  function renameProfile(profileId) {
    const current = getProfiles().find(item => item.id === profileId);
    if (!current) return;
    const name = promptForInput('Enter a display name for your profile:', current.name);
    const cleaned = String(name || '').trim();
    if (!cleaned) return;
    updateProfile(profileId, profile => ({ ...profile, name: cleaned }));
    showProfileStatus(`Profile renamed: ${cleaned}`);
    closeProfileMenu();
  }

  function setProfilePhoto(profileId, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = String(reader.result || '');
      updateProfile(profileId, profile => ({ ...profile, avatar }));
      showProfileStatus('Profile photo updated');
      closeProfileMenu();
    };
    reader.readAsDataURL(file);
  }

  function removeProfilePhoto(profileId) {
    updateProfile(profileId, profile => ({ ...profile, avatar: '' }));
    showProfileStatus('Profile photo removed');
    closeProfileMenu();
  }

  function showProfileStatus(message) {
    const status = document.querySelector('#profileStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 1800);
  }

  function clearLogs() {
    localStorage.removeItem('cpu-simulator-logs');
    const list = document.querySelector('#systemLogList');
    if (list) list.innerHTML = '<li class="system-log-empty">No system activity recorded yet.</li>';
    showProfileStatus('Logs cleared');
  }

  function initProfiles() {
    refreshProfileUI();
    const profileToggle = document.querySelector('#profileToggle');
    const profilePanel = document.querySelector('#profilePanel');
    if (profileToggle && profilePanel) {
      profileToggle.addEventListener('click', event => {
        event.stopPropagation();
        const willOpen = profilePanel.hidden;
        profilePanel.hidden = !willOpen;
        profileToggle.setAttribute('aria-expanded', String(willOpen));
        const accessibilityPanel = document.querySelector('#accessibilityPanel');
        if (accessibilityPanel && !accessibilityPanel.hidden) {
          accessibilityPanel.hidden = true;
          document.querySelector('#accessibilityToggle')?.setAttribute('aria-expanded', 'false');
        }
        if (willOpen) profilePanel.querySelector('button')?.focus();
      });
      document.addEventListener('click', event => {
        if (!profilePanel.hidden && !profilePanel.contains(event.target) && !profileToggle.contains(event.target)) {
          profilePanel.hidden = true;
          profileToggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !profilePanel.hidden) {
          profilePanel.hidden = true;
          profileToggle.setAttribute('aria-expanded', 'false');
          profileToggle.focus();
        }
      });
    }

    document.querySelector('#profileCreate')?.addEventListener('click', () => {
      const name = promptForInput('Create a new profile name:', 'New Profile');
      if (name !== null && createProfile(name)) showProfileStatus(`Profile created: ${name.trim()}`);
    });
    document.querySelector('#profileRename')?.addEventListener('click', () => {
      const current = readProfile();
      renameProfile(current.id);
    });
    document.querySelector('#profileReset')?.addEventListener('click', () => {
      const resetProfile = { ...DEFAULT_PROFILE, active: true };
      if (typeof window.confirm === 'function' && !window.confirm('Reset all saved profiles back to the default AK profile?')) return;
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify([resetProfile]));
      writeProfile(resetProfile);
      refreshProfileUI();
      showProfileStatus('Profile reset: AK is now active');
    });
    document.querySelectorAll('[data-clear-logs]').forEach(button => button.addEventListener('click', () => {
      if (window.confirm('Clear all saved system logs?')) clearLogs();
    }));
    document.querySelector('#profileResetView')?.addEventListener('click', () => window.A11yManager?.resetAccessibilityPrefs());
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-profile-menu]') && !event.target.closest('[data-menu-panel]') && !event.target.closest('[data-profile-action]')) {
        closeProfileMenu();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeProfileMenu();
    });
    window.addEventListener('storage', event => {
      if (Object.values(STORAGE_KEYS).includes(event.key)) refreshProfileUI();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfiles);
  else initProfiles();

  window.ProfileManager = {
    readProfile,
    writeProfile,
    clearLogs,
    STORAGE_KEYS,
    getStorageScope() { return readProfile()?.id || 'default'; }
  };
})();
