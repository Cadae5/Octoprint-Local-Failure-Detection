// octoprint_failuredetector/static/js/failuredetector.js (Updated for Tab Settings)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        self.settings = parameters[0];

        // --- Observables for UI state ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- NEW: Observables to hold settings on the tab ---
        self.tab_snapshot_url = ko.observable();
        self.tab_interval = ko.observable();
        self.tab_confidence = ko.observable();

        // --- API Interaction ---
        self.forceCheck = function() { /* ... no changes ... */ };

        // --- NEW: Function to save settings from the tab ---
        self.saveTabSettings = function() {
            var payload = {
                command: "save_settings",
                snapshot_url: self.tab_snapshot_url(),
                interval: self.tab_interval(),
                confidence: self.tab_confidence()
            };
            OctoPrint.simpleApiCommand("failuredetector", "save_settings", payload)
                .done(function() {
                    new PNotify({ title: "Settings Saved", type: "success", hide: true });
                });
        };

        // This function is called when the ViewModel is first created
        self.onBeforeBinding = function() {
            // Copy the main settings into our tab-local observables
            self.tab_snapshot_url(self.settings.settings.plugins.failuredetector.webcam_snapshot_url());
            self.tab_interval(self.settings.settings.plugins.failuredetector.check_interval());
            self.tab_confidence(self.settings.settings.plugins.failuredetector.failure_confidence());
        };

        // This function listens for messages from the backend
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }

            // If we got a confirmation that settings were saved, we're good.
            if (data.type === "settings_saved") {
                // We can optionally re-load the main settings here if needed
                self.settings.requestData();
                return;
            }
            // (The snapshot URL and status logic remains the same)
            if (data.snapshot_url) { /* ... no changes ... */ }
            switch (data.status) { /* ... no changes ... */ }
        };
        
        // --- (Computed properties like snapshotUrlWithCacheBuster are the same) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { /* ... no changes ... */ });
        self.statusColor = ko.computed(function() { /* ... no changes ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... no changes ... */ });
        self.lastResultText = ko.computed(function() { /* ... no changes ... */ });
    }

    // (The OCTOPRINT_VIEWMODELS registration is the same)
    OCTOPRINT_VIEWMODELS.push({ /* ... no changes ... */ });
});
