import SwiftUI

struct Configuration {
    let url: URL
    let token: String
    let scenario: String
    let fixed: Bool
    let reset: Bool
    init() {
        let args = ProcessInfo.processInfo.arguments
        func value(_ key: String, _ fallback: String) -> String {
            guard let i = args.firstIndex(of: key), i + 1 < args.count else { return fallback }
            return args[i + 1]
        }
        url = URL(string: value("--base-url", "http://127.0.0.1:1"))!
        precondition(url.scheme == "http" && url.host == "127.0.0.1", "Reference app accepts only the local fixture")
        token = value("--token", "")
        scenario = value("--scenario", "booking")
        fixed = value("--mode", "broken") == "fixed"
        reset = args.contains("--reset")
    }
}
struct SavedState: Codable {
    var pending = false
    var key = UUID().uuidString
    var draft = ""
}
@MainActor final class BookingModel: ObservableObject {
    let config: Configuration
    private var saved = SavedState()
    private let file: URL
    @Published var draft = ""
    @Published var status = "Ready"
    @Published var confirmed = false
    @Published var enabled = true
    @Published var loading = false
    @Published var recommendations = "A window seat, if you like."
    @Published var ready = false
    init(config: Configuration) {
        self.config = config
        file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("state.json")
        if config.reset { try? FileManager.default.removeItem(at: file) }
        if let data = try? Data(contentsOf: file), let existing = try? JSONDecoder().decode(SavedState.self, from: data) { saved = existing }
        draft = saved.draft
    }
    private func persist() throws {
        let data = try JSONEncoder().encode(saved)
        try data.write(to: file, options: .atomic)
        let handle = try FileHandle(forWritingTo: file)
        try handle.synchronize()
        try handle.close()
    }
    func start() async {
        if config.scenario == "dependency" {
            do { _ = try await request("/recommendations") }
            catch { recommendations = "Recommendations are unavailable."; enabled = config.fixed }
        }
        ready = true
        if saved.pending { await book() }
    }
    func saveDraft() {
        do {
            if config.fixed { saved.draft = draft; try persist() }
            // Deliberate defect in broken mode: acknowledge only the in-memory draft.
            status = "Saved"
        } catch { status = "Save failed" }
    }
    func book() async {
        guard !loading else { return }
        loading = true; status = "Confirming your booking…"
        do {
            saved.pending = true; try persist()
            _ = try await request("/bookings", body: ["intentId": "one-user-intent"], key: config.fixed ? saved.key : nil)
            saved.pending = false; try persist(); confirmed = true; status = "Booking confirmed"
        } catch { status = "Request interrupted. Reopen to retry." }
        loading = false
    }
    private func request(_ path: String, body: [String: String]? = nil, key: String? = nil) async throws -> Data {
        var request = URLRequest(url: config.url.appendingPathComponent(String(path.dropFirst())))
        request.timeoutInterval = 60
        request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        if let body { request.httpMethod = "POST"; request.httpBody = try JSONEncoder().encode(body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let key { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
        return data
    }
}
@main struct DemoApp: App {
    @StateObject private var model = BookingModel(config: Configuration())
    var body: some Scene { WindowGroup { DemoView(model: model).task { await model.start() } } }
}
struct DemoView: View {
    @ObservedObject var model: BookingModel
    private let ink = Color(red: 0.12, green: 0.20, blue: 0.21)
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack { Image(systemName: "point.topleft.down.to.point.bottomright.curvepath"); Text("UNHAPPYPATH").tracking(2).font(.caption.weight(.bold)); Spacer(); Text("REFERENCE APP").font(.system(size: 9, weight: .semibold)).foregroundStyle(.secondary) }
                    .padding(.top, 24)
                Text(model.config.scenario == "draft" ? "A thought worth\nkeeping." : "A little room\nto get away.")
                    .font(.system(size: 44, weight: .semibold, design: .serif)).lineSpacing(-3)
                if model.config.scenario == "draft" { draftCard } else { bookingCard }
                Text(model.status).font(.subheadline.weight(.medium)).accessibilityIdentifier("status")
                if model.ready { Text("Ready for the journey").font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("ready") }
                Spacer(minLength: 12)
                HStack(spacing: 8) { Circle().fill(model.config.fixed ? Color.green : Color.orange).frame(width: 7, height: 7); Text(model.config.fixed ? "Fixed implementation" : "Intentionally fragile implementation").font(.caption) }
                Text("Synthetic data. Local backend. No real reservations.").font(.caption2).foregroundStyle(.secondary)
            }.padding(28).frame(maxWidth: 560)
        }.frame(maxWidth: .infinity).foregroundStyle(ink).background(Color(red: 0.96, green: 0.95, blue: 0.91)).preferredColorScheme(.light)
    }
    var bookingCard: some View {
        VStack(alignment: .leading, spacing: 22) {
            ZStack { RoundedRectangle(cornerRadius: 18).fill(Color(red: 0.80, green: 0.86, blue: 0.78)); Image(systemName: model.confirmed ? "checkmark.seal" : "mountain.2").font(.system(size: 70, weight: .ultraLight)).padding(36) }.frame(height: 170)
            HStack { VStack(alignment: .leading, spacing: 6) { Text("The quiet cabin").font(.title2.weight(.semibold)); Text("One night · One guest").font(.subheadline).foregroundStyle(.secondary) }; Spacer(); Text("$80").font(.title2.weight(.medium)) }
            if model.config.scenario == "dependency" { Text(model.recommendations).font(.subheadline).accessibilityIdentifier("recommendations") }
            Button { Task { await model.book() } } label: { HStack { Spacer(); if model.loading { ProgressView().tint(.white) }; Text(model.confirmed ? "Confirmed" : "Book this stay").fontWeight(.semibold); Spacer() }.padding(18).foregroundStyle(.white).background(ink.opacity(model.enabled ? 1 : 0.35)).clipShape(RoundedRectangle(cornerRadius: 12)) }
                .disabled(!model.enabled || model.loading || model.confirmed).accessibilityIdentifier("book")
        }
    }
    var draftCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("TRAVEL NOTES").font(.caption.weight(.semibold)).tracking(2)
            TextField("What do you want to remember?", text: $model.draft, axis: .vertical).lineLimit(4...6).padding(18).background(.white.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityIdentifier("draftInput")
            Button("Save draft") { model.saveDraft() }.buttonStyle(.borderedProminent).tint(ink).accessibilityIdentifier("saveDraft")
        }
    }
}
