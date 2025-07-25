// octoprint_failuredetector/static/js/failuredetector.js (The Final, Unified, Pagination Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        console.log("FailureDetector UNIFIED ViewModel initializing (Pagination Version)...");

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
        self.allRecordedTimelapses = ko.observableArray([]);
        self.currentPage = ko.observable(0);
        self.itemsPerPage = ko.observable(5);
        self.frameBaseUrl = ko.observable("");

        // --- SECTION 2: All UI Derived Values (Computed) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); return null; });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (text.includes("Checking") || text.includes("Refreshing") || text.includes("Extracting")) return "deepskyblue";
            return "#333";
        });
        self.statusColorNavbar = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (text.includes("Checking") || text.includes("Refreshing") || text.includes("Extracting")) return "deepskyblue";
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
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? 'Submit' : (self.modalScreen() === 'draw_boxes' ? 'Skip & Confirm' : 'Next'); });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        self.selectedFramePath = ko.computed(function() { if (self.timelapseFrames().length > 0 && self.selectedFrameIndex() < self.timelapseFrames().length) { return self.timelapseFrames()[self.selectedFrameIndex()]; } return null; });
        self.selectedFrameUrl = ko.computed(function() {
            if (self.selectedFramePath()) { return self.frameBaseUrl() + "/" + self.selectedFramePath(); }
            if (self.modalScreen() === 'final_confirm' && !self.isFailureReport()) { return self.lastSnapshotUrl(); }
            return null;
        });
        self.finalConfirmTitle = ko.computed(function() { return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit"; });
        self.finalFailureTypeText = ko.computed(function() { return "Outcome: " + (self.isFailureReport() ? self.selectedFailureType() : "Success"); });
        self.totalPages = ko.computed(function() { return Math.ceil(self.allRecordedTimelapses().length / self.itemsPerPage()); });
        self.paginatedTimelapses = ko.computed(function() {
            var start = self.currentPage() * self.itemsPerPage();
            var end = start + self.itemsPerPage();
            return self.allRecordedTimelapses().slice(start, end);
        });
        self.canGoPrevious = ko.computed(function() { return self.currentPage() > 0; });
        self.canGoNext = ko.computed(function() { return self.currentPage() < self.totalPages() - 1; });

        // --- SECTION 3: All UI Actions (Button Clicks) ---
        self.forceCheck = function() { console.log("JS: 'Force Check' button clicked."); OctoPrint.simpleApiCommand("failuredetector", "force_check"); };
        self.openFailureReportModal = function() {
            console.log("JS: 'Report Failure' button clicked.");
            self.lastSnapshotUrl(self.snapshotUrlWithCacheBuster());
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };
        self.refreshTimelapseList = function() {
            console.log("JS: Requesting list of recorded timelapses.");
            self.statusText("Refreshing timelapse list...");
            self.isChecking(true);
            OctoPrint.simpleApiCommand("failuredetector", "list_recorded_timelapses");
        };
        self.reportFailureForTimelapse = function(timelapse) {
            console.log("JS: Report button clicked for timelapse:", timelapse.name);
            self.statusText("Extracting frames...");
            self.isChecking(true);
            OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames", { filename: timelapse.name });
        };
        self.reportYes = function() { console.log("JS Modal: Clicked YES"); self.isFailureReport(true); self.modalScreen('select_frame'); };
        self.reportNo = function() { console.log("JS Modal: Clicked NO"); self.isFailureReport(false); self.modalScreen('final_confirm'); };
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
        self.previousPage = function() { if (self.canGoPrevious()) { self.currentPage(self.currentPage() - 1); } };
        self.nextPage = function() { if (self.canGoNext()) { self.currentPage(self.currentPage() + 1); } };

        // --- SECTION 4: The Single Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            try {
                if (data.type === 'recorded_timelapse_list' || data.type === 'error') {
                    self.isChecking(false);
                    self.statusText("Idle");
                }
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }
                if (data.type === 'recorded_timelapse_list') {
                    self.allRecordedTimelapses(data.timelapses);
                    self.currentPage(0);
                    if (data.timelapses.length === 0) {
                        new PNotify({title: "Info", text: "No timelapse recordings (.mp4) found.", type: "info", hide: true});
                    }
                    return;
                }
                if (data.type === 'error') {
                    new PNotify({title: "Plugin Error", text: data.message, type: "error", hide: true});
                    return;
                }
                if (data.type === 'frame_list') {
                    self.isChecking(false);
                    self.statusText("Frames loaded.");
                    self.frameBaseUrl(data.base);
                    self.timelapseFrames(data.frames);
                    var lastIndex = data.frames.length > 0 ? data.frames.length - 1 : 0;
                    self.selectedFrameIndex(lastIndex);
                    if (data.frames.length > 0) {
                        var lastFramePath = data.frames[lastIndex];
                        var fullUrl = self.frameBaseUrl() + "/" + lastFramePath;
                        self.lastSnapshotUrl(fullUrl);
                    }
                    self.modalScreen('confirm_failure');
                    $('#failure_report_modal').modal('show');
                    return;
                }
                if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
                if (data.status) {
                    switch (data.status) {
                        case "checking": self.isChecking(true); self.statusText("Checking..."); break;
                        case "idle": self.isChecking(false); self.statusText("Idle"); if (data.result) self.lastResult(data.result); break;
                        case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                        case "error": self.isChecking(false); self.statusText("Error: " + (data.error || "Unknown")); self.lastResult("Error"); break;
                    }
                }
            } catch (e) {
                console.error("FailureDetector UI Error:", e);
            }
        };

        self.onAfterBinding = function() {
            self.refreshTimelapseList();
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: [ "#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal" ]
    });
});
