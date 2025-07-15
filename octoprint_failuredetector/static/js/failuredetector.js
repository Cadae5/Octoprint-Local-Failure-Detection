// octoprint_failuredetector/static/js/failuredetector.js (Repaired)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        self.settings = parameters[0];

        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        self.statusColor = ko.computed(function() { /* ... no changes needed here ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... no changes needed here ... */ });
        self.lastResultText = ko.computed(function() { /* ... no changes needed here ... */ });

        self.forceCheck = function() {
            if (self.isChecking()) return;

            // Immediately update the UI to show the latest snapshot will be fetched
            var url = self.settings.settings.plugins.failuredetector.webcam_snapshot_url();
            self.snapshotUrl(url);
            self.snapshotTimestamp(new Date().getTime());

            // Call the API and provide immediate feedback
            OctoPrint.simpleApiCommand("failuredetector", "force_check")
                .done(function() {
                    self.statusText("Manual check requested...");
                })
                .fail(function() {
                    new PNotify({title: "Error", text: "Could not send command to backend.", type: "error", hide: true});
                });
        };

        self.onDataUpdaterPluginMessage = function(plugin, data) {
             if (plugin !== "failuredetector") { return; }
             // (The rest of this function remains the same, no changes needed)
             if (data.snapshot_url) { /* ... */ }
             switch (data.status) { /* ... */ }
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
