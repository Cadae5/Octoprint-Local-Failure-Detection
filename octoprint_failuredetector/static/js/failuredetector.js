// octoprint_failuredetector/static/js/failuredetector.js (The Final, Unified, "Bulletproof" Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // This log is our proof that the script is running AT ALL.
        console.log("FailureDetector UNIFIED ViewModel initializing...");

        // --- SECTION 1: All UI Variables (Observables) ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);
        self.lastSnapshotUrl = ko.observable(null);

        // --- SECTION 2: All UI Derived Values (Computed) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); return null; });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... */ });
        self.modalTitle = ko.computed(function() {
            switch (self.modalScreen()) {
                case 'confirm_failure': return 'Report Print Outcome';
                case 'select_frame': return 'When did the failure start?';
                case 'draw_boxes': return 'Draw Boxes Over Failure';
                case 'final_confirm': return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit";
                default: return 'Report';
            }
        });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? 'Submit' : (self.modalScreen() === 'draw_boxes' ? 'Skip & Confirm' : 'Next'); });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        self.selectedFramePath = ko.computed(function() { if (self.timelapseFrames().length > 0) return self.timelapseFrames()[self.selectedFrameIndex()]; return null; });
        self.selectedFrameUrl = ko.computed(function() {
            if (self.selectedFramePath()) return OctoPrint.options.baseurl + "downloads/timelapse/" + self.selectedFramePath();
            if (self.modalScreen() === 'final_confirm' && !self.isFailureReport()) return self.lastSnapshotUrl();
            return null;
        });
        self.finalConfirmTitle = ko.computed(function() { return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit"; });
        self.finalFailureTypeText = ko.computed(function() { return "Outcome: " + (self.isFailureReport() ? self.selectedFailureType() : "Success"); });

        // --- SECTION 3: All UI Actions (Button Clicks) ---
        self.forceCheck = function() { console.log("JS: 'Force Check' button clicked."); OctoPrint.simpleApiCommand("failuredetector", "force_check"); };
        self.openFailureReportModal = function() {
            console.log("JS: 'Report Failure' button clicked.");
            self.lastSnapshotUrl(self.snapshotUrlWithCacheBuster());
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };
        self.reportYes = function() { console.log("JS Modal: Clicked YES"); self.isFailureReport(true); self.modalScreen('select_frame'); OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames"); };
        self.reportNo = function() { console.log("JS Modal: Clicked NO"); self.isFailureReport(false); self.modalScreen('final_confirm'); };
        self.modalConfirm = function() {
            console.log("JS Modal: Clicked CONFIRM/NEXT/SUBMIT");
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('draw_boxes');
            else if (screen === 'draw_boxes') self.modalScreen('final_confirm');
            else if (screen === 'final_confirm') self.submitFinalReport();
        };
        self.modalBack = function() {
            console.log("JS Modal: Clicked BACK");
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('confirm_failure');
            else if (screen === 'draw_boxes') self.modalScreen('select_frame');
            else if (screen === 'final_confirm') self.isFailureReport() ? self.modalScreen('draw_boxes') : self.modalScreen('confirm_failure');
        };
        self.submitFinalReport = function() {
            var framePath = self.isFailureReport() ? self.selectedFramePath() : "last_snapshot.jpg";
            var payload = {
                failure_type: self.isFailureReport() ? self.selectedFailureType() : "Success",
                failed_frame_path: framePath,
                bounding_boxes: [],
                include_settings: self.includePrintSettings()
            };
            console.log("JS Modal: Submitting final report with payload:", payload);
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
            $('#failure_report_modal').modal('hide');
        };

        // --- SECTION 4: The Single Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            try {
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }
                if (data.type === 'frame_list') { self.timelapseFrames(data.frames); self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0); return; }
                if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
                if (data.status) { /* ... (status update logic) ... */ }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };
    }

    // This single ViewModel now controls EVERYTHING and has NO dependencies.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: [ "#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal" ]
    });
});
