
        // Redirect small screens to the mobile notice page.
        if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
            window.location.replace('mobile.html');
        }
    