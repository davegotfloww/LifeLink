/* ==========================================================================
   LifeLink — interaction layer
   Matches the markup/classes already in index.html (nav-toggle, nav-links,
   .stats .num, .section-head, .step, .pair, .compat-row, .urgent-item, etc.)
   Adds its own minimal stylesheet for new states so the existing <style>
   block in the HTML doesn't need to be touched.
   ========================================================================== */
const supabaseUrl = "https://qkdqjtzlkzfwwlyocvlo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrZHFqdHpsa3pmd3dseW9jdmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzgxNTksImV4cCI6MjEwMDgxNDE1OX0.B1gOHFIv5VPqvXvRb-dOiGBTbCuC2Jpya1_s-pLUcyI";

const supabase = window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);
(function () {
  "use strict";

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  /* ------------------------------------------------------------------ */
  /* 0. Inject the small set of styles the interactions below rely on   */
  /* ------------------------------------------------------------------ */
  function injectStyles() {
    const css = `
      section[id], #top { scroll-margin-top: 100px; }

      header.scrolled { box-shadow: 0 1px 0 var(--hair); }

      .nav-links a.active::after { width: 100%; }

      @media (max-width: 900px) {
        .nav-links.open {
          display: flex !important;
          position: absolute;
          top: 100%;
          left: 0; right: 0;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
          background: var(--paper);
          border-bottom: 1px solid var(--hair);
          padding: 4px 24px 20px;
          z-index: 40;
        }
        .nav-links.open li { width: 100%; padding: 14px 0; border-bottom: 1px solid var(--hair); }
        .nav-links.open li:last-child { border-bottom: none; }
      }

      .reveal {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity .7s ease, transform .7s ease;
      }
      .reveal.is-visible { opacity: 1; transform: translateY(0); }

      @media (prefers-reduced-motion: reduce) {
        .reveal { opacity: 1; transform: none; transition: none; }
      }
    `;
    const style = document.createElement("style");
    style.setAttribute("data-source", "script.js");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /* 1. Mobile nav toggle                                                */
  /* ------------------------------------------------------------------ */
  function initNav() {
    const toggle = document.querySelector(".nav-toggle");
    const navLinks = document.querySelector(".nav-links");
    if (!toggle || !navLinks) return;

    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "nav-links");

    const setOpen = (open) => {
      navLinks.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => {
      setOpen(!navLinks.classList.contains("open"));
    });

    navLinks.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("click", (e) => {
      if (!navLinks.contains(e.target) && !toggle.contains(e.target))
        setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    // header shadow once the page scrolls under it
    const header = document.querySelector("header");
    if (header) {
      const onScroll = () =>
        header.classList.toggle("scrolled", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2. Active nav link tracks the section in view                      */
  /* ------------------------------------------------------------------ */
  function initActiveLinkTracking() {
    const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');
    if (!navAnchors.length) return;

    const targets = new Map();
    navAnchors.forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      if (section) targets.set(section, a);
    });
    if (!targets.size) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = targets.get(entry.target);
          if (!link || !entry.isIntersecting) return;
          navAnchors.forEach((a) => a.classList.remove("active"));
          link.classList.add("active");
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );

    targets.forEach((_link, section) => observer.observe(section));
  }

  /* ------------------------------------------------------------------ */
  /* 3. Scroll-reveal for content blocks                                 */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    const els = document.querySelectorAll(
      ".section-head, .step, .pair, .compat-row, .urgent-item, .stat",
    );
    if (!els.length) return;

    els.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.transitionDelay = prefersReduced ? "0ms" : `${(i % 4) * 70}ms`;
    });

    if (prefersReduced) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    els.forEach((el) => observer.observe(el));
  }

  /* ------------------------------------------------------------------ */
  /* 4. Count-up animation for the stat strip (.stats .num)              */
  /* ------------------------------------------------------------------ */
  function animateNum(el) {
    const firstNode = el.childNodes[0];
    if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) return;

    const raw = firstNode.textContent.trim();
    const hasComma = raw.includes(",");
    const decimals = (raw.split(".")[1] || "").length;
    const target = parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(target)) return;

    if (prefersReduced) return; // leave the printed value as-is

    const format = (n) => {
      const fixed = decimals ? n.toFixed(decimals) : Math.round(n).toString();
      return hasComma
        ? Number(fixed).toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : fixed;
    };

    const duration = 1200;
    const start = performance.now();

    function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      firstNode.textContent = format(target * eased);
      if (p < 1) requestAnimationFrame(frame);
      else firstNode.textContent = format(target);
    }
    requestAnimationFrame(frame);
  }

  function initStatCounters() {
    const statsSection = document.querySelector(".stats");
    if (!statsSection) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll(".num").forEach(animateNum);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );
    observer.observe(statsSection);
  }

  /* ------------------------------------------------------------------ */
  /* 5. Live-feeling "requested N minutes ago" ticker on urgent items    */
  /* ------------------------------------------------------------------ */
  function initUrgentTimestamps() {
    const subs = document.querySelectorAll(".urgent-item .sub");
    if (!subs.length) return;

    const parsed = [];
    subs.forEach((sub) => {
      const text = sub.textContent;
      const match = text.match(/requested\s+(\d+)\s*(minute|hour)s?\s*ago/i);
      if (!match) return;
      const unitMinutes = /hour/i.test(match[2]) ? 60 : 1;
      parsed.push({
        el: sub,
        prefix: text.slice(0, text.indexOf("requested")),
        minutes: parseInt(match[1], 10) * unitMinutes,
      });
    });
    if (!parsed.length) return;

    const render = (entry) => {
      const m = entry.minutes;
      const label =
        m < 60
          ? `${m} minute${m === 1 ? "" : "s"} ago`
          : `${Math.floor(m / 60)} hour${Math.floor(m / 60) === 1 ? "" : "s"} ago`;
      entry.el.textContent = `${entry.prefix}requested ${label}`;
    };

    setInterval(() => {
      parsed.forEach((entry) => {
        entry.minutes += 1;
        render(entry);
      });
    }, 60000);
  }

  /* ------------------------------------------------------------------ */
  /* 6. Footer year, kept accurate without editing the HTML by hand      */
  /* ------------------------------------------------------------------ */
  function initFooterYear() {
    const line = document.querySelector(".footer-bottom span");
    if (!line) return;
    line.textContent = line.textContent.replace(
      /\d{4}/,
      new Date().getFullYear(),
    );
  }

  /* ------------------------------------------------------------------ */
  /* 7. Local auth flow for donors and hospitals                       */
  /* ------------------------------------------------------------------ */
  function getStoredUsers() {
    try {
      return JSON.parse(localStorage.getItem("lifelinkUsers")) || [];
    } catch (error) {
      return [];
    }
  }

  function saveStoredUsers(users) {
    localStorage.setItem("lifelinkUsers", JSON.stringify(users));
  }

  function getStoredSession() {
    try {
      return JSON.parse(localStorage.getItem("lifelinkCurrentUser"));
    } catch (error) {
      return null;
    }
  }

  function setStoredSession(user) {
    localStorage.setItem("lifelinkCurrentUser", JSON.stringify(user));
  }

  function clearStoredSession() {
    localStorage.removeItem("lifelinkCurrentUser");
  }

  function isAuthPage() {
    const path = window.location.pathname.split("/").pop().toLowerCase();
    return path === "auth.html";
  }

  function renderUserIsland() {
    const headerNav = document.querySelector("header nav.wrap");
    const ctaGroup = headerNav?.querySelector(".nav-cta");
    if (!headerNav || !ctaGroup) return;

    let island = document.getElementById("user-island");
    if (!island) {
      island = document.createElement("div");
      island.id = "user-island";
      island.className = "user-island";
      island.hidden = true;
      headerNav.insertBefore(island, ctaGroup);
    }

    const currentUser = getStoredSession();
    const authNavLink = document.querySelector(
      'header .nav-links a[href="auth.html"]',
    );
    const authCta = document.querySelector(
      'header .nav-cta a[href="auth.html"]',
    );

    const footerRequestLink = document.getElementById("footer-request-blood-link");
    const shouldShowFooterRequest = currentUser && currentUser.role === "hospital";
    if (footerRequestLink) {
      const listItem = footerRequestLink.closest("li");
      if (listItem) {
        listItem.hidden = !shouldShowFooterRequest;
      } else {
        footerRequestLink.hidden = !shouldShowFooterRequest;
      }
    }

    if (!currentUser) {
      island.hidden = true;
      if (authNavLink) authNavLink.parentElement.hidden = false;
      if (authCta) authCta.hidden = false;
      const joinButton = ctaGroup.querySelector(".btn-solid");
      if (joinButton) {
        joinButton.textContent = "Join LifeLink";
        joinButton.setAttribute("href", "auth.html");
      }
      return;
    }

    const roleLabel = currentUser.role === "hospital" ? "Hospital" : "Donor";
    const initials = (currentUser.name || "A")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");

    island.hidden = false;
    island.innerHTML = `
      <a href="dashboard.html" class="user-island-link">
        <span class="user-island-badge">${roleLabel}</span>
        <span class="user-island-initials">${initials || "U"}</span>
      </a>
    `;

    if (authNavLink) authNavLink.parentElement.hidden = true;
    if (authCta) authCta.hidden = true;

    const joinButton = ctaGroup.querySelector('.btn-solid[href="auth.html"]');
    if (joinButton) {
      joinButton.textContent = "Open dashboard";
      joinButton.setAttribute("href", "dashboard.html");
    }
  }

  function initAuth() {
    if (isAuthPage() && getStoredSession()) {
      window.location.replace("dashboard.html");
      return;
    }

    const authApp = document.querySelector("[data-auth-app]");
    if (!authApp) return;

    const tabs = authApp.querySelectorAll(".auth-tab");
    const panels = authApp.querySelectorAll(".auth-panel");
    const authForms = authApp.querySelector("[data-auth-forms]");
    const authSession = authApp.querySelector("[data-auth-session]");
    const messageBox = authApp.querySelector("[data-auth-message]");
    const signupForm = document.getElementById("signup-form");
    const loginForm = document.getElementById("login-form");
    const signupRole = document.getElementById("signup-role");
    const donorFields = document.getElementById("donor-fields");
    const hospitalFields = document.getElementById("hospital-fields");
    const logoutBtn = document.getElementById("logout-btn");
    const sessionName = document.getElementById("session-name");
    const sessionRole = document.getElementById("session-role");
    const sessionDetail = document.getElementById("session-detail");
    const loginEmail = document.getElementById("login-email");

    function setMessage(text, type = "success") {
      if (!messageBox) return;
      messageBox.textContent = text;
      messageBox.className = `auth-message ${type}`;
    }

    // Debug: log auth form presence and supabase availability
    console.log("initAuth: signupForm=", !!signupForm, "loginForm=", !!loginForm, "supabase=", typeof window.supabase !== "undefined");
    if (signupForm) {
      console.log("signup form detected", signupForm);
      const submitBtn = signupForm.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.addEventListener("click", () => console.log("Signup button clicked"));
    }

    // API wrapper — if backend exists, prefer it; otherwise fall back to localStorage
    let apiAvailable = false;
    async function checkApi() {
      try {
        const r = await fetch("/api/ping");
        apiAvailable = r.ok;
      } catch (e) {
        apiAvailable = false;
      }
    }
    checkApi();

    async function apiSignup(payload) {
      try {
        const r = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return await r.json();
      } catch (e) {
        return { error: "network" };
      }
    }

    async function signUpUser(formData) {
      console.log("signUpUser.start", formData);
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      console.log("signUpUser.supabaseResponse", data, error);
      if (error) {
        setMessage(error.message, "error");
        return false;
      }

      const user = data.user;
      if (!user) {
        setMessage(
          "Account created. Please check your email to verify your account before logging in.",
          "success",
        );
        return true;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          full_name: formData.full_name,
          email: formData.email,
          user_type: formData.user_type,
          hospital_name: formData.hospital_name || null,
          blood_type: formData.blood_type || null,
          phone: formData.phone || null,
        });

      if (profileError) {
        setMessage(profileError.message, "error");
        return false;
      }

      setMessage("Account created successfully! You can now log in.", "success");
      return true;
    }

    async function loginUser(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        alert(error.message);
        return;
      }

      const user = data.user;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        alert(profileError.message);
        return;
      }

      if (String(profile.user_type || "").toLowerCase() === "hospital") {
        window.location.href = "hospital-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    }

    async function apiLogin(payload) {
      try {
        const r = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return await r.json();
      } catch (e) {
        return { error: "network" };
      }
    }

    async function apiGetRequests() {
      const { data: requests, error } = await supabase
        .from("urgent_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return { requests: [] };
      }

      return { requests };
    }

    async function createUrgentRequest(request) {
      const { error } = await supabase
        .from("urgent_requests")
        .insert({
          hospital_name: request.hospital_name,
          blood_type: request.blood_type,
          place_ward: request.place_ward,
          priority: request.priority,
          contact: request.contact,
          message: request.message,
          status: "Active",
        });

      if (error) {
        alert(error.message);
        return;
      }

      alert("Urgent request submitted!");
    }

    function showTab(target) {
      tabs.forEach((tab) => {
        const isActive = tab.getAttribute("data-tab") === target;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isTarget = panel.getAttribute("data-view") === target;
        panel.hidden = !isTarget;
      });
    }

    function updateRoleFields() {
      const role = signupRole ? signupRole.value : "donor";
      if (donorFields) {
        donorFields.hidden = role !== "donor";
        donorFields.setAttribute("aria-hidden", String(role !== "donor"));
        donorFields.querySelectorAll("input").forEach((input) => {
          input.required = role === "donor";
        });
      }
      if (hospitalFields) {
        hospitalFields.hidden = role !== "hospital";
        hospitalFields.setAttribute("aria-hidden", String(role !== "hospital"));
        hospitalFields.querySelectorAll("input").forEach((input) => {
          input.required = role === "hospital";
        });
      }
    }

    function renderSession() {
      const currentUser = getStoredSession();
      if (!currentUser) {
        if (authForms) authForms.hidden = false;
        if (authSession) authSession.hidden = true;
        return;
      }

      if (authForms) authForms.hidden = true;
      if (authSession) authSession.hidden = false;

      if (sessionName) sessionName.textContent = currentUser.name;
      if (sessionRole) {
        sessionRole.textContent =
          currentUser.role === "hospital"
            ? "Hospital account ready"
            : "Donor account ready";
      }
      if (sessionDetail) {
        sessionDetail.textContent =
          currentUser.role === "hospital"
            ? `${currentUser.hospitalName || "Hospital partner"} · ${currentUser.location || "Location shared"}`
            : `${currentUser.bloodType || "Blood type available"} · ${currentUser.location || "Location shared"}`;
      }
      // show hospital dashboard link when appropriate
      const dash = document.getElementById("to-dashboard");
      if (dash) {
        if (currentUser.role === "hospital") {
          dash.style.display = "inline-flex";
        } else {
          dash.style.display = "none";
        }
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        showTab(tab.getAttribute("data-tab"));
        setMessage("");
      });
    });

    if (signupRole) {
      signupRole.addEventListener("change", updateRoleFields);
      updateRoleFields();
    }

    if (authApp) {
      authApp.addEventListener("submit", async (event) => {
        const target = event.target;
        const form = target instanceof HTMLFormElement ? target : target.closest("form");
        console.log("authApp submit event", target, form?.id);
        if (!form) return;

        if (form.id === "signup-form") {
          console.log("signup submit handler triggered");
          event.preventDefault();
          event.stopPropagation();

          const formData = new FormData(form);
          const payload = {
            full_name: String(formData.get("name") || "").trim(),
            user_type: String(formData.get("role") || "donor"),
            email: String(formData.get("email") || "")
              .trim()
              .toLowerCase(),
            password: String(formData.get("password") || ""),
            confirmPassword: String(formData.get("confirmPassword") || ""),
            blood_type: String(formData.get("bloodType") || "").trim(),
            hospital_name: String(formData.get("hospitalName") || "").trim(),
            phone: String(formData.get("contact") || "").trim(),
            location: String(formData.get("location") || "").trim(),
          };

          if (
            !payload.full_name ||
            !payload.email ||
            !payload.password ||
            !payload.confirmPassword ||
            !payload.location
          ) {
            setMessage(
              "Please complete all required fields before continuing.",
              "error",
            );
            return;
          }

          if (payload.password.length < 6) {
            setMessage("Choose a password with at least 6 characters.", "error");
            return;
          }

          if (payload.password !== payload.confirmPassword) {
            setMessage("Your password confirmation does not match.", "error");
            return;
          }

          if (payload.user_type === "donor" && !payload.blood_type) {
            setMessage(
              "Please share your blood type so LifeLink can match you effectively.",
              "error",
            );
            return;
          }

          if (payload.user_type === "hospital" && !payload.hospital_name) {
            setMessage(
              "Please share your hospital name so we can connect you appropriately.",
              "error",
            );
            return;
          }

          try {
            console.log("signup payload", payload);
            const success = await signUpUser(payload);
            if (success) {
              showTab("login");
            }
          } catch (e) {
            console.error(e);
            setMessage("Signup failed. Please try again.", "error");
          }
          return;
        }

        if (form.id === "login-form") {
          event.preventDefault();
          event.stopPropagation();

          const formData = new FormData(form);
          const email = String(formData.get("email") || "")
            .trim()
            .toLowerCase();
          const password = String(formData.get("password") || "");

          if (!email || !password) {
            setMessage("Enter your email and password to continue.", "error");
            return;
          }

          await checkApi();
          if (apiAvailable) {
            const resp = await apiLogin({ email, password });
            if (resp && resp.error) {
              setMessage(resp.error || "Login failed", "error");
              return;
            }
            const u = resp.user || resp;
            setStoredSession(u);
            renderSession();
            renderUserIsland();
            setMessage(`Welcome back, ${u.name}.`, "success");
            window.location.replace("dashboard.html");
            return;
          }

          await loginUser(email, password);
          return;
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearStoredSession();
        renderSession();
        renderUserIsland();
        setMessage("You have been logged out.");
        showTab("login");
      });
    }

    renderSession();
    renderUserIsland();
    showTab("login");
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    initNav();
    initActiveLinkTracking();
    initReveal();
    initStatCounters();
    initUrgentTimestamps();
    initFooterYear();
    renderUserIsland();
    initAuth();
  });
})();
