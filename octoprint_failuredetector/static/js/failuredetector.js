// octoprint_failuredetector/static/js/failuredetector.js (The Definitive Reset Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- Observables for the main tab ---
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- Observables for the Modal Workflow ---
        self.modalScreen = ko.observable('none');
        self.modalTitle = ko.observable("Report a Failure");
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);

        // --- Computed Properties for the UI ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) { return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); }
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... unchanged ... */ });
        self.modalBackVisible = ko.computed(function() { return self.modalScreen() !== 'confirm_failure'; });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? 'Submit' : 'Confirm'; });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            console.log("Force Check button clicked!"); // Diagnostic log
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };
        self.openFailureReportModal = function() {
            console.log("Report Failure button clicked!"); // Diagnostic log
            self.modalScreen('confirm_failure');
            self.modalTitle("Did this print fail?");
            $('#failure_report_modal').modal('show');
        };
        self.modalConfirm = function() { /* ... unchanged from previous correct version ... */ };
        self.modalBack = function() { /* ... unchanged from previous correct version ... */ };
        self.submitFinalReport = function() { /* ... unchanged from previous correct version ... */ };

        // --- Main Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }
            console.log("Message received from backend:", data); // Diagnostic log
            try {
                if (data.type === 'show_post_print_dialog') {
                    self.openFailureReportModal();
                    return;
                }
                if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
                if (data.status) {
                    switch (data.status) {
                        case "checking": self.isChecking(true); self.statusText("Checking..."); break;
                        case "idle": self.isChecking(false); self.statusText("Idle"); if (data.result) self.lastResult(data.result); break;
                        case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                        case "error": self.isChecking(false); self.statusText("Error: " + data.error); self.lastResult("Error"); break;
                    }
                }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal"]
    });
});
