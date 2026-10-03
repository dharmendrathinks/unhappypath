import XCTest

@MainActor final class JourneyTests: XCTestCase {
    let draft = "Remember the umbrella."
    var base: String { ProcessInfo.processInfo.environment["UP_URL"]! }
    var token: String { ProcessInfo.processInfo.environment["UP_TOKEN"]! }
    func api(_ path: String, _ data: [String: Any]? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: base + path)!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 10
        if let data { request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: data); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (bytes, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
    }
    func event(_ kind: String) async throws { _ = try await api("/control/event", ["kind": kind]) }
    func waitFor(_ condition: () async throws -> Bool) async throws {
        for _ in 0..<200 { if try await condition() { return }; try await Task.sleep(for: .milliseconds(100)) }
        XCTFail("Required journey evidence did not arrive"); throw URLError(.timedOut)
    }
    func testJourney() async throws {
        continueAfterFailure = false
        let config = try await api("/control/config")
        let scenario = config["scenario"] as! String
        let variant = config["variant"] as! String
        let app = XCUIApplication()
        let arguments = ["--base-url", base, "--token", token, "--scenario", scenario, "--mode", variant == "fixed" ? "fixed" : "broken"]
        app.launchArguments = arguments + ["--reset"]
        app.launch()
        try await event("app.started")
        XCTAssertTrue(app.staticTexts["ready"].waitForExistence(timeout: 15))
        if scenario == "draft" {
            let input = app.textFields["draftInput"]
            XCTAssertTrue(input.waitForExistence(timeout: 5)); input.tap(); input.typeText(draft)
            app.buttons["saveDraft"].tap()
            XCTAssertEqual(app.staticTexts["status"].label, "Saved")
            try await event("draft.saved")
            if variant != "baseline" {
                app.terminate(); try await event("app.terminated")
                app.launchArguments = arguments; app.launch(); try await event("app.relaunched")
                XCTAssertTrue(app.staticTexts["ready"].waitForExistence(timeout: 10))
            }
            let value = app.textFields["draftInput"].value as? String ?? ""
            _ = try await api("/control/observe", ["draft": value, "completed": true])
        } else {
            let button = app.buttons["book"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            if !button.isEnabled {
                _ = try await api("/control/observe", ["bookingEnabled": false, "confirmed": false, "completed": true])
                let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Final observable state"; attachment.lifetime = .keepAlways; add(attachment)
                return
            }
            button.tap()
            if scenario == "booking" && variant != "baseline" {
                try await waitFor { let state = try await self.api("/control/state"); return state["faultActivated"] as? Bool == true }
                app.terminate(); try await event("app.terminated")
                app.launchArguments = arguments; app.launch(); try await event("app.relaunched")
            }
            try await waitFor { app.staticTexts["status"].label == "Booking confirmed" }
            _ = try await api("/control/observe", ["confirmed": true, "completed": true])
        }
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Final observable state"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
