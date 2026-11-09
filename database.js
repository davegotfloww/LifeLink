// ===== DATABASE =====
// We store 3 tables in local storage
function getDonors() { return 
JSON.parse(localStorage.getItem('donors') || '[]');}
function getRequests() { return 
    JSON.parse(localStorage.getItem('requests') || '[]');}
