import ExpoModulesCore
import StoreKit

/// Plainworth Pro purchases straight through Apple's StoreKit 2. No outside
/// service: Apple signs every transaction and StoreKit checks the signature on
/// the phone, so only transactions that pass ("verified") ever count.
public class PlainworthStoreModule: Module {
  private var updatesTask: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("PlainworthStore")

    /// Sent whenever a purchase arrives or changes outside a buy button tap:
    /// Ask to Buy approved, a purchase on another device, a refund.
    Events("onPurchasesChanged")

    OnStartObserving {
      self.startListening()
    }

    OnStopObserving {
      self.updatesTask?.cancel()
      self.updatesTask = nil
    }

    OnDestroy {
      self.updatesTask?.cancel()
    }

    /// The products with their price in the buyer's own currency.
    AsyncFunction("getProducts") { (ids: [String]) async throws -> [[String: Any]] in
      let products = try await Product.products(for: ids)
      return products.map { p in
        ["id": p.id, "displayPrice": p.displayPrice, "displayName": p.displayName]
      }
    }

    /// Everything this Apple ID owns right now, verified on the phone.
    /// Works offline: StoreKit keeps its own signed copy.
    AsyncFunction("currentEntitlements") { () async -> [[String: Any]] in
      return await Self.entitlements()
    }

    /// Restore Purchases: asks the App Store for this Apple ID's purchases
    /// (may ask the user to sign in), then reads them back.
    AsyncFunction("sync") { () async throws -> [[String: Any]] in
      try await AppStore.sync()
      return await Self.entitlements()
    }

    /// Shows Apple's purchase sheet. Result: bought, cancelled, pending, or failed.
    AsyncFunction("purchase") { (id: String) async throws -> [String: Any] in
      guard let product = try await Product.products(for: [id]).first else {
        return ["result": "failed", "message": "Plainworth Pro isn’t available in the App Store right now."]
      }
      let outcome = try await product.purchase()
      switch outcome {
      case .success(let verification):
        switch verification {
        case .verified(let transaction):
          await transaction.finish()
          return ["result": "bought", "entitlements": await Self.entitlements()]
        case .unverified(_, let error):
          return ["result": "failed", "message": "The App Store couldn’t confirm this purchase. (\(error.localizedDescription))"]
        }
      case .pending:
        return ["result": "pending"]
      case .userCancelled:
        return ["result": "cancelled"]
      @unknown default:
        return ["result": "failed"]
      }
    }
  }

  /// Listens for transactions that happen away from the buy button. Apple asks
  /// apps to start this at launch so nothing is missed; the JS side subscribes
  /// as soon as the app starts.
  private func startListening() {
    guard updatesTask == nil else { return }
    updatesTask = Task.detached { [weak self] in
      // Anything bought earlier that was never finished (the app quit mid-purchase).
      for await result in Transaction.unfinished {
        if case .verified(let transaction) = result { await transaction.finish() }
      }
      for await result in Transaction.updates {
        if case .verified(let transaction) = result { await transaction.finish() }
        let list = await PlainworthStoreModule.entitlements()
        self?.sendEvent("onPurchasesChanged", ["entitlements": list])
      }
    }
  }

  static func entitlements() async -> [[String: Any]] {
    var list: [[String: Any]] = []
    for await result in Transaction.currentEntitlements {
      guard case .verified(let t) = result, t.revocationDate == nil else { continue }
      var item: [String: Any] = [
        "productId": t.productID,
        "purchaseDate": t.purchaseDate.timeIntervalSince1970 * 1000,
        "originalPurchaseDate": t.originalPurchaseDate.timeIntervalSince1970 * 1000,
      ]
      if let expires = t.expirationDate { item["expirationDate"] = expires.timeIntervalSince1970 * 1000 }
      list.append(item)
    }
    return list
  }
}
