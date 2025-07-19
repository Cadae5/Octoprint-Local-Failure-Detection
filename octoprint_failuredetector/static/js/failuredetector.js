// octoprint_failuredetector/static/js/failuredetector.js (The Definitive Reset Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- SECTION 1: Observables (UI Variables) ---
        // For the main "Failure Detector" tab
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // For the "Report Failure" modal
        self.modalScreen = ko.observable('none'); // 'confirm_failure', 'select_frame', 'draw_boxes', 'final_confirm'
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);

        // --- SECTION 2: Computed Properties (Derived UI Values) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333";
        });
        self.statusColorNavbar = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white";
        });
        self.modalTitle = ko.computed(function() {
            switch (self.modalScreen()) {
                case 'confirm_failure': return 'Report Print Outcome';
                case 'select_frame': return 'When did the failure start?';
                case 'draw_boxes': return 'Draw Boxes Over Failure';
                case 'final_confirm': return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit";
                default: return 'Report';
            }
        });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? 'Submit' : 'Next'; });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        
        // --- SECTION 3: Actions (Functions for Buttons) ---
        self.forceCheck = function() {
            console.log("JS: 'Force Check' button clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };
        self.openFailureReportModal = function() {
            console.log("JS: 'Report Failure' button clicked.");
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };
        self.reportYes = function() { self.isFailureReport(true); self.modalScreen('select_frame'); };
        self.reportNo = function() { self.isFailureReport(false); self.modalScreen('final_confirm'); };
        self.modalConfirm = function() {
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('draw_boxes');
            else if (screen === 'draw_boxes') self.modalScreen('final_confirm');
            else if (screen === 'final_confirm') self.submitFinalReport();
        };
        self.modalBack = function() {
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('confirm_failure');
            else if (screen === 'draw_boxes') self.modalScreen('select_frame');
            else if (screen === 'final_confirm') self.isFailureReport() ? self.modalScreen('draw_boxes') : self.modalScreen('confirm_failure');
        };
        self.submitFinalReport = function() {
            var payload = {
                failure_type: self.isFailureReport() ? self.selectedFailureType() : "Success",
                failed_frame_path: "placeholder.jpg",
                bounding_boxes: [],
                include_settings: self.includePrintSettings()
            };
            console.log("JS: Submitting final report with payload:", payload);
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
            $('#failure_report_modal').modal('hide');
        };

        // --- SECTION 4: Message Handler (Receives data from backend) ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data); // Vital diagnostic log
            try {
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }
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
