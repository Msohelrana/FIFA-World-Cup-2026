// ===== User auth UI =====
function updateUserBtn() {
  if (!els.userBtn) return;
  const label = els.userBtn.querySelector(".btn-label");
  if (state.currentUser) {
    if (label) label.textContent = ` ${state.currentUser.name}`;
    els.userBtn.classList.add("is-active");
    els.userBtn.title = "Click to sign out";
    if (els.settingsBtn) els.settingsBtn.hidden = false;
  } else {
    if (label) label.textContent = " Sign in";
    els.userBtn.classList.remove("is-active");
    els.userBtn.title = "Sign in to join the prediction leaderboard";
    if (els.settingsBtn) els.settingsBtn.hidden = true;
  }
}

function openAuthModal(mode = "signin") {
  const existing = document.getElementById("authModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "authModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">👤</div>
      <h2 id="authTitle">${mode === "signup" ? "Create account" : "Sign in"}</h2>
      <p class="modal-subtitle">${mode === "signup"
        ? "Join the leaderboard. Your picks will be saved to your account."
        : "Sign in to save picks and join the leaderboard."}</p>
      <input type="text" id="authName" class="modal-input"
             placeholder="Display name" autocomplete="name" spellcheck="false"
             style="${mode === "signup" ? "" : "display:none"}; margin-bottom:8px;">
      <input type="email" id="authEmail" class="modal-input"
             placeholder="Email" autocomplete="email" spellcheck="false" style="margin-bottom:8px;">
      <input type="password" id="authPassword" class="modal-input"
             placeholder="Password (min 8 chars)" autocomplete="${mode === "signup" ? "new-password" : "current-password"}">
      <p class="modal-error" id="authError" aria-live="polite"></p>
      <div class="modal-actions">
        <button id="authToggle" class="modal-btn modal-btn-ghost" type="button">
          ${mode === "signup" ? "Have an account? Sign in" : "New here? Create account"}
        </button>
        <button id="authSubmit" class="modal-btn modal-btn-primary" type="button">
          ${mode === "signup" ? "Sign up" : "Sign in"}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };

  const err = modal.querySelector("#authError");
  const nameEl = modal.querySelector("#authName");
  const emailEl = modal.querySelector("#authEmail");
  const pwEl = modal.querySelector("#authPassword");
  const submit = async () => {
    err.textContent = "";
    const email = emailEl.value.trim();
    const pw = pwEl.value;
    if (!email || !pw) { err.textContent = "Email and password are required."; return; }
    if (mode === "signup" && !nameEl.value.trim()) { err.textContent = "Display name is required."; return; }
    if (pw.length < 8) { err.textContent = "Password must be at least 8 characters."; return; }
    try {
      const user = mode === "signup"
        ? await appwriteAuth.signUp(email, pw, nameEl.value.trim())
        : await appwriteAuth.logIn(email, pw);
      if (!user) { err.textContent = "Sign-in failed. Please try again."; return; }
      state.currentUser = user;
      setAdmin(isUserAdmin(user)); // grant admin only if this is the owner account
      updateUserBtn();
      close();
      await afterLogin();
      rerenderActive();           // re-render so admin-only UI appears immediately
    } catch (ex) {
      err.textContent = (ex && ex.message) || "Authentication error.";
    }
  };

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#authSubmit").addEventListener("click", submit);
  modal.querySelector("#authToggle").addEventListener("click", () => {
    close();
    openAuthModal(mode === "signup" ? "signin" : "signup");
  });
  [nameEl, emailEl, pwEl].forEach(el => el.addEventListener("keydown", e => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  }));
  setTimeout(() => (mode === "signup" ? nameEl : emailEl).focus(), 60);
}

async function logoutUser() {
  const ok = await showConfirm(`Sign out of ${state.currentUser.name}?`, {
    title: "Sign out", icon: "👤", iconType: "info", confirmLabel: "Sign out",
  });
  if (!ok) return;
  await appwriteAuth.logOut();
  state.currentUser = null;
  state.matchPicks = {};           // clear picks so the next login doesn't inherit them
  saveMatchPicks();                // wipe localStorage too
  state.leaderboardUsers = [];
  state.leaderboardLoaded = false;
  setAdmin(false);                 // any admin powers go away with logout
  updateUserBtn();
  rerenderActive();                // re-render to drop admin-only controls
}

els.userBtn.addEventListener("click", () => {
  if (state.currentUser) logoutUser();
  else openAuthModal("signin");
});
if (els.settingsBtn) els.settingsBtn.addEventListener("click", openSettingsModal);

function openSettingsModal() {
  const existing = document.getElementById("settingsModal");
  if (existing) existing.remove();

  const u = state.currentUser;
  const modal = document.createElement("div");
  modal.id = "settingsModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">⚙️</div>
      <h2>Account Settings</h2>
      <p class="modal-subtitle"><strong>${escapeHTML(u.name)}</strong><br><span style="opacity:0.7;font-size:13px">${escapeHTML(u.email)}</span></p>
      <div class="modal-actions" style="flex-direction:column;gap:10px">
        <button id="settingsChangePw" class="modal-btn modal-btn-primary" type="button" style="width:100%">🔑 Change Password</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#settingsChangePw").addEventListener("click", () => { close(); openChangePasswordModal(); });
}

function openChangePasswordModal() {
  const existing = document.getElementById("changePwModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "changePwModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-icon modal-icon-info">🔑</div>
      <h2>Change Password</h2>
      <input type="password" id="cpwCurrent" class="modal-input" placeholder="Current password" autocomplete="current-password" style="margin-bottom:8px">
      <input type="password" id="cpwNew" class="modal-input" placeholder="New password (min 8 chars)" autocomplete="new-password" style="margin-bottom:8px">
      <input type="password" id="cpwConfirm" class="modal-input" placeholder="Confirm new password" autocomplete="new-password">
      <p class="modal-error" id="cpwError" aria-live="polite"></p>
      <div class="modal-actions">
        <button id="cpwCancel" class="modal-btn modal-btn-ghost" type="button">Cancel</button>
        <button id="cpwSubmit" class="modal-btn modal-btn-primary" type="button">Update Password</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  const close = () => {
    modal.classList.add("modal-closing");
    modal.addEventListener("animationend", () => {
      modal.remove();
      if (!document.querySelector(".modal")) document.body.classList.remove("modal-open");
    }, { once: true });
  };

  const err = modal.querySelector("#cpwError");
  const submit = async () => {
    err.textContent = "";
    const current = modal.querySelector("#cpwCurrent").value;
    const next = modal.querySelector("#cpwNew").value;
    const confirm = modal.querySelector("#cpwConfirm").value;
    if (!current || !next || !confirm) { err.textContent = "All fields are required."; return; }
    if (next.length < 8) { err.textContent = "New password must be at least 8 characters."; return; }
    if (next !== confirm) { err.textContent = "New passwords do not match."; return; }
    const btn = modal.querySelector("#cpwSubmit");
    btn.disabled = true;
    btn.textContent = "Updating…";
    try {
      await appwriteAuth.updatePassword(next, current);
      close();
      showAlert("Your password has been updated.", { title: "Password changed", icon: "✅", iconType: "success" });
    } catch (ex) {
      err.textContent = (ex && ex.message) || "Failed to update password.";
      btn.disabled = false;
      btn.textContent = "Update Password";
    }
  };

  modal.querySelector(".modal-backdrop").addEventListener("click", close);
  modal.querySelector("#cpwCancel").addEventListener("click", close);
  modal.querySelector("#cpwSubmit").addEventListener("click", submit);
  modal.querySelectorAll("input").forEach(el => el.addEventListener("keydown", e => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") close();
  }));
  setTimeout(() => modal.querySelector("#cpwCurrent").focus(), 60);
}

// First-login migration: push any local picks up so the user's account adopts them.
async function afterLogin() {
  // Only fetch own doc (1 read). Full leaderboard is lazy-loaded when first opened.
  const ownServerRow = await userPicksSync.fetchOwn();
  if (ownServerRow) {
    // Keep own row in leaderboardUsers for self-scoring while leaderboard is unloaded
    const idx = state.leaderboardUsers.findIndex(u => u.userId === state.currentUser.id);
    if (idx >= 0) state.leaderboardUsers[idx] = ownServerRow;
    else state.leaderboardUsers.push(ownServerRow);
  }
  state.leaderboardLoaded = false; // force reload on next leaderboard open
  const localCount = Object.keys(state.matchPicks).length;
  const serverCount = ownServerRow ? Object.keys(ownServerRow.picks).length : 0;

  if (localCount > 0 && serverCount === 0) {
    // First-time login with local picks → push them up
    state.currentUser.firstSubmittedAt = new Date().toISOString();
    await userPicksSync.saveOwn();
  } else if (serverCount > 0 && localCount === 0) {
    // Returning user, no local picks → pull server picks
    state.matchPicks = ownServerRow.picks;
    saveMatchPicks();
  } else if (serverCount > 0 && localCount > 0) {
    // Both exist — prompt user to choose
    const useLocal = await showConfirm(
      `You have ${localCount} picks on this device and ${serverCount} on your account. Keep this device's picks and overwrite the server?`,
      { title: "Merge picks", icon: "🔀", iconType: "info", confirmLabel: "Use device", danger: true }
    );
    if (useLocal) {
      await userPicksSync.saveOwn();
    } else {
      state.matchPicks = ownServerRow.picks;
      saveMatchPicks();
    }
  }
  if (state.view === "picks") renderPicks();
}

