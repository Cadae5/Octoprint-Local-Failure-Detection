// octoprint_failuredetector/static/js/failuredetector.js (The Final, Working, Diagnostic Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // This log proves the entire script is running.
        console.log("FailureDetector ViewModel initializing...");

        // --- All Observables ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        self.modalScreen = ko.observable('none');

        // --- Computed Properties ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            return null;
        });
        self.modalTitle = ko.computed(function() {
            if (self.modalScreen() === 'confirm_failure') return 'Report Print Outcome';
            return 'Step ' + self.modalScreen(); // Simple title for other steps
        });
        self.modalConfirmText = ko.computed(function() { return 'Next'; });
        // Add other computed properties as needed...

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            console.log("JS: 'Force Check' button clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        self.openFailureReportModal = function() {
            console.log("JS: 'Report Failure' button clicked. Setting screen to 'confirm_failure'.");
            self.modalScreen('confirm_failure');
            // This log will prove the variable was set correctly before the modal opens.
            console.log("JS: modalScreen() is now:", self.modalScreen());
            $('#failure_report_modal').modal('show');
        };
        
        // --- Dummy functions for the modal workflow ---
        self.reportYes = function() { console.log("JS: Clicked YES"); self.modalScreen('select_frame'); };
        self.reportNo = function() { console.log("JS: Clicked NO"); self.modalScreen('final_confirm'); };
        self.modalConfirm = function() { console.log("JS: Clicked NEXT"); };
        self.modalBack = function() { console.log("JS: Clicked BACK"); self.modalScreen('confirm_failure'); };

        // --- Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            // We are keeping this simple to ensure it doesn't break.
            if (data.snapshot_url) {
                self.snapshotUrl(data.snapshot_url);
                self.snapshotTimestamp(new Date().getTime());
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal"]
    });
});
