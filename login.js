const API_URL = "http://127.0.0.1:8000";

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const loginResult = document.getElementById("loginResult");

    if (loginResult) {
        loginResult.innerHTML = "";
    }

    if (!username || !password) {
        alert("Kullanıcı adı ve şifre gir.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            alert("Kullanıcı adı veya şifre hatalı");
            return;
        }

        const user = await response.json();

        const page = window.location.pathname.split("/").pop();

        console.log("Giriş yapılan sayfa:", page);
        console.log("Gelen kullanıcı:", user);

        if (page === "login.html" && user.role !== "user") {
            alert("Bu giriş ekranı sadece user kullanıcıları içindir.");
            return;
        }

        if (page === "admin-login.html" && user.role !== "admin") {
            alert("Bu giriş ekranı sadece admin içindir.");
            return;
        }

        if (
            page === "staff-login.html" &&
            !["network", "technical", "ms"].includes(user.role)
        ) {
            alert("Bu giriş ekranı sadece IT ekipleri içindir.");
            return;
        }

        localStorage.setItem("currentUser", JSON.stringify(user));
        localStorage.setItem("username", user.username);
        localStorage.setItem("role", user.role);
        localStorage.setItem("department", user.department || "");
        localStorage.setItem("accessToken", user.access_token || "");

        if (user.role === "admin") {
            window.location.href = "admin.html";
        } 
        else if (user.role === "user") {
            window.location.href = "index.html";
        } 
        else if (user.role === "network") {
            window.location.href = "network-dashboard.html";
        }
        else if (user.role === "technical") {
            window.location.href = "technical-dashboard.html";
        }
        else if (user.role === "ms") {
            window.location.href = "ms-dashboard.html";
        }
        else {
            alert("Tanımsız rol: " + user.role);
        }

    } catch (error) {
        console.error("Login hatası:", error);
        alert("Backend bağlantı hatası.");
    }
}
