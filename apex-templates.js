/* Runnable Apex examples for the ForceNotes playground and the design patterns page.
 * Only plain Apex (no org): they run in the browser-based Apex Lab.
 * Avoid apostrophes inside Apex strings here: the source is stored in JS template literals. */
(function (root) {
  var T = {};
  function add(id, title, group, code) { T[id] = { title: title, group: group, lang: 'apex', code: code.replace(/^\n/, '') }; }

  /* ---------------------------------------------------------------- basics */
  add('apex-hello', 'Apex: hello and basics', 'Apex basics', `
// Anonymous Apex: statements run top to bottom, like Execute Anonymous.
String greeting = 'Hello, ForceNotes';
Integer a = 7;
Integer b = 2;
Decimal price = 19.99;

System.debug(greeting.toUpperCase());
System.debug('Integer maths: ' + a / b + ' remainder ' + Math.mod(a, b));
System.debug('Decimal maths: ' + (price * 3));
System.debug('Is blank? ' + String.isBlank(greeting));

// Loops and conditions
for (Integer i = 1; i <= 3; i++) {
    if (Math.mod(i, 2) == 0) {
        System.debug(i + ' is even');
    } else {
        System.debug(i + ' is odd');
    }
}
`);

  add('apex-collections', 'Apex: List, Set and Map', 'Apex basics', `
List<String> names = new List<String>{ 'Acme', 'Globex', 'Acme', 'Initech' };
Set<String> unique = new Set<String>(names);
Map<String, Integer> lengths = new Map<String, Integer>();

for (String n : unique) {
    lengths.put(n, n.length());
}

System.debug('List size: ' + names.size());
System.debug('Set size: ' + unique.size() + ' (duplicates removed)');
System.debug('Map: ' + lengths);
System.debug('Globex length: ' + lengths.get('Globex'));
System.debug('Has Umbrella? ' + lengths.containsKey('Umbrella'));

names.sort();
System.debug('Sorted: ' + names);

// Group values: Map of key -> List of values
Map<Integer, List<String>> byLength = new Map<Integer, List<String>>();
for (String n : unique) {
    Integer len = n.length();
    if (!byLength.containsKey(len)) {
        byLength.put(len, new List<String>());
    }
    byLength.get(len).add(n);
}
System.debug(byLength);
`);

  add('apex-oop', 'Apex: classes, inheritance, interfaces', 'Apex basics', `
public interface Shape {
    Decimal area();
    String name();
}

public abstract class BaseShape implements Shape {
    protected String label;
    public BaseShape(String label) { this.label = label; }
    public String name() { return label; }
    public override String toString() { return name() + ' with area ' + area(); }
}

public class Rectangle extends BaseShape {
    private Decimal width;
    private Decimal height;
    public Rectangle(Decimal width, Decimal height) {
        super('Rectangle');
        this.width = width;
        this.height = height;
    }
    public Decimal area() { return width * height; }
}

public class Circle extends BaseShape {
    private Decimal radius;
    public Circle(Decimal radius) {
        super('Circle');
        this.radius = radius;
    }
    public Decimal area() { return (3.14 * radius * radius).setScale(2); }
}

List<Shape> shapes = new List<Shape>{ new Rectangle(2, 3), new Circle(2) };
Decimal total = 0;
for (Shape s : shapes) {
    System.debug(s);
    total += s.area();
}
System.debug('Total area: ' + total);
`);

  add('apex-exceptions', 'Apex: exceptions and try/catch/finally', 'Apex basics', `
public class InsufficientFundsException extends Exception {}

public class BankAccount {
    private Decimal balance;
    public BankAccount(Decimal opening) { balance = opening; }
    public void withdraw(Decimal amount) {
        if (amount > balance) {
            throw new InsufficientFundsException('Balance ' + balance + ' is below ' + amount);
        }
        balance -= amount;
    }
    public Decimal getBalance() { return balance; }
}

BankAccount acct = new BankAccount(100);
try {
    acct.withdraw(30);
    acct.withdraw(500);
} catch (InsufficientFundsException e) {
    System.debug('Caught custom exception: ' + e.getMessage());
} finally {
    System.debug('Balance is ' + acct.getBalance());
}

// Built-in exceptions are thrown for you
try {
    String s = null;
    System.debug(s.length());
} catch (NullPointerException e) {
    System.debug('NPE: ' + e.getMessage());
}
try {
    System.debug(10 / 0);
} catch (MathException e) {
    System.debug('Math: ' + e.getMessage());
}
`);

  add('apex-enum-switch', 'Apex: enum and switch', 'Apex basics', `
public enum Stage { PROSPECTING, QUALIFIED, PROPOSAL, CLOSED_WON, CLOSED_LOST }

public class StageRules {
    public static Integer probability(Stage s) {
        switch on s {
            when PROSPECTING { return 10; }
            when QUALIFIED { return 30; }
            when PROPOSAL { return 60; }
            when CLOSED_WON { return 100; }
            when else { return 0; }
        }
    }
}

for (Stage s : Stage.values()) {
    System.debug(s + ' -> ' + StageRules.probability(s) + '%');
}

Object value = 42;
switch on value {
    when String text { System.debug('A string: ' + text); }
    when Integer num { System.debug('An integer: ' + num); }
    when else { System.debug('Something else'); }
}
`);

  /* ------------------------------------------------------------ design patterns */
  add('apex-singleton', 'Pattern: Singleton', 'Design patterns', `
public class AppConfig {
    private static AppConfig instance;
    private Map<String, String> settings = new Map<String, String>();

    // Private constructor: nobody else can call "new AppConfig()"
    private AppConfig() {
        // Imagine this being loaded once from Custom Metadata
        settings.put('region', 'EMEA');
        settings.put('maxRetries', '3');
        System.debug('AppConfig created (this prints only once)');
    }

    public static AppConfig getInstance() {
        if (instance == null) {
            instance = new AppConfig();
        }
        return instance;
    }

    public String get(String key) { return settings.get(key); }
}

System.debug(AppConfig.getInstance().get('region'));
System.debug(AppConfig.getInstance().get('maxRetries'));
System.debug('Same object? ' + (AppConfig.getInstance() == AppConfig.getInstance()));
`);

  add('apex-factory', 'Pattern: Factory', 'Design patterns', `
public interface Notifier {
    String send(String to, String message);
}
public class EmailNotifier implements Notifier {
    public String send(String to, String message) { return 'EMAIL to ' + to + ': ' + message; }
}
public class SmsNotifier implements Notifier {
    public String send(String to, String message) { return 'SMS to ' + to + ': ' + message; }
}
public class UnknownChannelException extends Exception {}

public class NotifierFactory {
    public static Notifier create(String channel) {
        switch on channel.toLowerCase() {
            when 'email' { return new EmailNotifier(); }
            when 'sms' { return new SmsNotifier(); }
            when else { throw new UnknownChannelException('No notifier for: ' + channel); }
        }
    }
}

// The caller never says "new EmailNotifier()". It only asks for a channel.
System.debug(NotifierFactory.create('email').send('sam@example.com', 'Your case was updated'));
System.debug(NotifierFactory.create('SMS').send('+15550100', 'Code: 4821'));
try {
    NotifierFactory.create('pigeon');
} catch (UnknownChannelException e) {
    System.debug('Error: ' + e.getMessage());
}
`);

  add('apex-builder', 'Pattern: Builder', 'Design patterns', `
public class ReportRequest {
    public String title;
    public String owner;
    public Integer maxRows;
    public Boolean includeCharts;

    public class RequestException extends Exception {}

    public class Builder {
        private ReportRequest r = new ReportRequest();

        public Builder withTitle(String title) { r.title = title; return this; }
        public Builder withOwner(String owner) { r.owner = owner; return this; }
        public Builder limitedTo(Integer rows) { r.maxRows = rows; return this; }
        public Builder withCharts() { r.includeCharts = true; return this; }

        public ReportRequest build() {
            if (String.isBlank(r.title)) {
                throw new RequestException('A title is required');
            }
            if (r.maxRows == null) { r.maxRows = 100; }   // sensible default
            if (r.includeCharts == null) { r.includeCharts = false; }
            return r;
        }
    }
}

ReportRequest req = new ReportRequest.Builder()
    .withTitle('Q4 pipeline')
    .withOwner('Sam')
    .withCharts()
    .build();
System.debug(req.title + ' / ' + req.owner + ' / rows=' + req.maxRows + ' / charts=' + req.includeCharts);

try {
    new ReportRequest.Builder().withOwner('Sam').build();
} catch (ReportRequest.RequestException e) {
    System.debug('Rejected: ' + e.getMessage());
}
`);

  add('apex-strategy', 'Pattern: Strategy', 'Design patterns', `
public interface DiscountStrategy {
    Decimal apply(Decimal price);
}
public class NoDiscount implements DiscountStrategy {
    public Decimal apply(Decimal price) { return price; }
}
public class PercentOff implements DiscountStrategy {
    private Decimal percent;
    public PercentOff(Decimal percent) { this.percent = percent; }
    public Decimal apply(Decimal price) { return price - (price * percent / 100); }
}
public class FlatOff implements DiscountStrategy {
    private Decimal amount;
    public FlatOff(Decimal amount) { this.amount = amount; }
    public Decimal apply(Decimal price) { return Math.max(0, price - amount); }
}

public class Checkout {
    private DiscountStrategy strategy;
    public Checkout(DiscountStrategy strategy) { this.strategy = strategy; }
    public Decimal total(List<Decimal> prices) {
        Decimal sum = 0;
        for (Decimal p : prices) { sum += strategy.apply(p); }
        return sum;
    }
}

List<Decimal> cart = new List<Decimal>{ 100, 250, 50 };
System.debug('No discount: ' + new Checkout(new NoDiscount()).total(cart));
System.debug('20% off:     ' + new Checkout(new PercentOff(20)).total(cart));
System.debug('Flat 10 off: ' + new Checkout(new FlatOff(10)).total(cart));
`);

  add('apex-observer', 'Pattern: Observer', 'Design patterns', `
public interface Listener {
    void onEvent(String name, String payload);
}

public class EventBus {
    private Map<String, List<Listener>> listeners = new Map<String, List<Listener>>();

    public void subscribe(String eventName, Listener l) {
        if (!listeners.containsKey(eventName)) {
            listeners.put(eventName, new List<Listener>());
        }
        listeners.get(eventName).add(l);
    }
    public Integer publish(String eventName, String payload) {
        if (!listeners.containsKey(eventName)) { return 0; }
        for (Listener l : listeners.get(eventName)) { l.onEvent(eventName, payload); }
        return listeners.get(eventName).size();
    }
}

public class AuditLog implements Listener {
    public void onEvent(String name, String payload) { System.debug('[audit] ' + name + ': ' + payload); }
}
public class SlackAlert implements Listener {
    public void onEvent(String name, String payload) { System.debug('[slack] heads up: ' + payload); }
}

EventBus bus = new EventBus();
bus.subscribe('OrderShipped', new AuditLog());
bus.subscribe('OrderShipped', new SlackAlert());
bus.subscribe('OrderCancelled', new AuditLog());

System.debug('Notified: ' + bus.publish('OrderShipped', 'Order 1001'));
System.debug('Notified: ' + bus.publish('OrderCancelled', 'Order 1002'));
System.debug('Notified: ' + bus.publish('Nobody', 'ignored'));
`);

  add('apex-decorator', 'Pattern: Decorator', 'Design patterns', `
public interface PriceCalculator {
    Decimal price();
}
public class BasePrice implements PriceCalculator {
    private Decimal base;
    public BasePrice(Decimal base) { this.base = base; }
    public Decimal price() { return base; }
}
// A decorator wraps another calculator and adds behaviour.
public virtual class PriceDecorator implements PriceCalculator {
    protected PriceCalculator inner;
    public PriceDecorator(PriceCalculator inner) { this.inner = inner; }
    public virtual Decimal price() { return inner.price(); }
}
public class TaxDecorator extends PriceDecorator {
    public TaxDecorator(PriceCalculator inner) { super(inner); }
    public override Decimal price() { return (inner.price() * 1.2).setScale(2); }
}
public class ShippingDecorator extends PriceDecorator {
    public ShippingDecorator(PriceCalculator inner) { super(inner); }
    public override Decimal price() { return inner.price() + 5; }
}

PriceCalculator plain = new BasePrice(100);
PriceCalculator withTax = new TaxDecorator(plain);
PriceCalculator everything = new ShippingDecorator(new TaxDecorator(new BasePrice(100)));
System.debug('Plain: ' + plain.price());
System.debug('With tax: ' + withTax.price());
System.debug('Tax then shipping: ' + everything.price());
`);

  add('apex-template-method', 'Pattern: Template Method', 'Design patterns', `
public abstract class DataImporter {
    // The template: the order of steps is fixed here
    public void run(List<String> rows) {
        List<String> clean = validate(rows);
        List<String> shaped = transform(clean);
        save(shaped);
        System.debug('Imported ' + shaped.size() + ' of ' + rows.size() + ' rows');
    }
    // Subclasses fill in the steps that differ
    protected abstract List<String> transform(List<String> rows);
    protected abstract void save(List<String> rows);

    // A default step that subclasses may override
    protected virtual List<String> validate(List<String> rows) {
        List<String> ok = new List<String>();
        for (String r : rows) { if (String.isNotBlank(r)) { ok.add(r); } }
        return ok;
    }
}

public class ContactImporter extends DataImporter {
    protected override List<String> transform(List<String> rows) {
        List<String> out = new List<String>();
        for (String r : rows) { out.add(r.trim().toLowerCase()); }
        return out;
    }
    protected override void save(List<String> rows) { System.debug('Saving contacts: ' + rows); }
}

new ContactImporter().run(new List<String>{ ' SAM@EXAMPLE.COM ', '', 'Pat@Example.com' });
`);

  add('apex-facade', 'Pattern: Facade', 'Design patterns', `
public class InventoryService {
    public Boolean reserve(String sku, Integer qty) { System.debug('inventory: reserved ' + qty + ' x ' + sku); return qty <= 10; }
}
public class PaymentService {
    public String charge(String customer, Decimal amount) { System.debug('payment: charged ' + customer + ' ' + amount); return 'PAY-1'; }
}
public class ShippingService {
    public String schedule(String customer) { System.debug('shipping: booked for ' + customer); return 'SHIP-1'; }
}

// One simple door in front of three subsystems
public class OrderFacade {
    private InventoryService inventory = new InventoryService();
    private PaymentService payments = new PaymentService();
    private ShippingService shipping = new ShippingService();

    public String placeOrder(String customer, String sku, Integer qty, Decimal total) {
        if (!inventory.reserve(sku, qty)) { return 'FAILED: out of stock'; }
        String payId = payments.charge(customer, total);
        String shipId = shipping.schedule(customer);
        return 'OK ' + payId + ' ' + shipId;
    }
}

System.debug(new OrderFacade().placeOrder('Acme', 'SKU-9', 2, 49.90));
System.debug(new OrderFacade().placeOrder('Acme', 'SKU-9', 50, 999));
`);

  add('apex-iterator', 'Pattern: Iterator', 'Design patterns', `
public class Countdown implements Iterable<Integer>, Iterator<Integer> {
    private Integer current;
    public Countdown(Integer from) { current = from; }

    public Iterator<Integer> iterator() { return this; }
    public Boolean hasNext() { return current > 0; }
    public Integer next() {
        Integer value = current;
        current--;
        return value;
    }
}

// Any Iterable works in a for loop, even your own class.
for (Integer n : new Countdown(5)) {
    System.debug(n);
}
`);

  add('apex-trigger-handler', 'Pattern: Trigger handler (simulated)', 'Design patterns', `
// The real thing runs inside a trigger with Trigger.new. Here we pass a list in by hand.
public class Customer {
    public String name; public String tier;
    public Customer(String name, String tier) { this.name = name; this.tier = tier; }
    public override String toString() { return name + '(' + tier + ')'; }
}

public virtual class TriggerHandler {
    private static Set<String> bypassed = new Set<String>();
    public static void bypass(String handlerName) { bypassed.add(handlerName); }
    public static void clearBypass(String handlerName) { bypassed.remove(handlerName); }

    public void run(String context, List<Customer> records) {
        String me = getName();
        if (bypassed.contains(me)) { System.debug(me + ' is bypassed'); return; }
        switch on context {
            when 'before insert' { beforeInsert(records); }
            when 'after insert' { afterInsert(records); }
            when else { System.debug('No logic for ' + context); }
        }
    }
    protected virtual String getName() { return 'TriggerHandler'; }
    protected virtual void beforeInsert(List<Customer> records) {}
    protected virtual void afterInsert(List<Customer> records) {}
}

public class CustomerHandler extends TriggerHandler {
    protected override String getName() { return 'CustomerHandler'; }
    protected override void beforeInsert(List<Customer> records) {
        for (Customer c : records) { if (c.tier == null) { c.tier = 'Standard'; } }
    }
    protected override void afterInsert(List<Customer> records) {
        System.debug('Welcome emails queued for ' + records.size() + ' customers');
    }
}

List<Customer> batch = new List<Customer>{ new Customer('Acme', null), new Customer('Globex', 'Gold') };
CustomerHandler h = new CustomerHandler();
h.run('before insert', batch);
System.debug(batch);
h.run('after insert', batch);
TriggerHandler.bypass('CustomerHandler');
h.run('after insert', batch);
`);

  add('apex-unit-of-work', 'Pattern: Unit of Work (simulated)', 'Design patterns', `
// Collect changes first, then "save" them together in one go.
// In real Apex the commit step would be a single insert and update call.
public class UnitOfWork {
    private List<String> newRecords = new List<String>();
    private List<String> changedRecords = new List<String>();
    private Integer commits = 0;

    public void registerNew(String r) { newRecords.add(r); }
    public void registerDirty(String r) { changedRecords.add(r); }

    public void commitWork() {
        System.debug('Committing ' + newRecords.size() + ' new and ' + changedRecords.size() + ' changed records in ONE transaction');
        commits++;
        newRecords.clear();
        changedRecords.clear();
    }
    public Integer getCommits() { return commits; }
}

UnitOfWork uow = new UnitOfWork();
for (Integer i = 1; i <= 5; i++) { uow.registerNew('Order-' + i); }
uow.registerDirty('Account-Acme');
uow.registerDirty('Account-Globex');
// Nothing is saved until we say so, so the limits are only hit once.
uow.commitWork();
System.debug('Total commits: ' + uow.getCommits());
`);

  /* ---------------------------------------------------------------- SOLID */
  add('apex-solid-srp', 'SOLID: Single Responsibility', 'SOLID', `
// BAD: one class that calculates, formats AND sends. Three reasons to change.
public class InvoiceEverything {
    public String process(Decimal net) {
        Decimal total = net * 1.2;
        String text = 'Invoice total: ' + total;
        return 'Sent -> ' + text;
    }
}

// GOOD: each class has one job and one reason to change.
public class InvoiceCalculator {
    public Decimal total(Decimal net) { return net * 1.2; }
}
public class InvoiceFormatter {
    public String format(Decimal total) { return 'Invoice total: ' + total; }
}
public class InvoiceSender {
    public String send(String body) { return 'Sent -> ' + body; }
}

public class InvoiceService {
    private InvoiceCalculator calc = new InvoiceCalculator();
    private InvoiceFormatter formatter = new InvoiceFormatter();
    private InvoiceSender sender = new InvoiceSender();
    public String process(Decimal net) {
        return sender.send(formatter.format(calc.total(net)));
    }
}

System.debug(new InvoiceEverything().process(100));
System.debug(new InvoiceService().process(100));
`);

  add('apex-solid-ocp', 'SOLID: Open/Closed', 'SOLID', `
// BAD: every new shipping method means editing this method (and risking old ones).
public class ShippingBad {
    public Decimal cost(String method, Decimal kg) {
        if (method == 'standard') { return kg * 2; }
        else if (method == 'express') { return kg * 5 + 10; }
        return 0;
    }
}

// GOOD: new behaviour is a new class. Existing code stays untouched.
public interface ShippingRate { Decimal cost(Decimal kg); }
public class StandardRate implements ShippingRate { public Decimal cost(Decimal kg) { return kg * 2; } }
public class ExpressRate implements ShippingRate { public Decimal cost(Decimal kg) { return kg * 5 + 10; } }
// Added later without touching anything above:
public class DroneRate implements ShippingRate { public Decimal cost(Decimal kg) { return kg * 9 + 25; } }

public class ShippingCalculator {
    public Decimal quote(ShippingRate rate, Decimal kg) { return rate.cost(kg); }
}

ShippingCalculator calc = new ShippingCalculator();
System.debug('Standard 3kg: ' + calc.quote(new StandardRate(), 3));
System.debug('Express  3kg: ' + calc.quote(new ExpressRate(), 3));
System.debug('Drone    3kg: ' + calc.quote(new DroneRate(), 3));
`);

  add('apex-solid-lsp', 'SOLID: Liskov Substitution', 'SOLID', `
// BAD: a Penguin IS-A Bird, but it cannot fly, so code that trusts Bird.fly() breaks.
public virtual class Bird {
    public virtual String fly() { return 'flapping into the sky'; }
}
public class Penguin extends Bird {
    public override String fly() { throw new UnsupportedOperationException('Penguins cannot fly'); }
}

List<Bird> birds = new List<Bird>{ new Bird(), new Penguin() };
for (Bird b : birds) {
    try {
        System.debug(b.fly());
    } catch (UnsupportedOperationException e) {
        System.debug('LSP violation: ' + e.getMessage());
    }
}

// GOOD: only birds that really fly promise to fly.
public interface Flyer { String fly(); }
public virtual class Animal { public virtual String move() { return 'moving'; } }
public class Sparrow extends Animal implements Flyer {
    public String fly() { return 'sparrow flaps'; }
}
public class Penguin2 extends Animal {
    public override String move() { return 'penguin waddles'; }
}

List<Flyer> flyers = new List<Flyer>{ new Sparrow() };
for (Flyer f : flyers) { System.debug(f.fly()); }
System.debug(new Penguin2().move());
`);

  add('apex-solid-isp', 'SOLID: Interface Segregation', 'SOLID', `
// BAD: one fat interface forces classes to implement things they do not need.
public interface WorkerBad {
    void work();
    void eat();
    void code();
}

// GOOD: small, focused interfaces. Implement only what you use.
public interface Workable { String work(); }
public interface Codable { String code(); }
public interface Feedable { String eat(); }

public class Developer implements Workable, Codable, Feedable {
    public String work() { return 'developer plans'; }
    public String code() { return 'developer writes Apex'; }
    public String eat() { return 'developer eats lunch'; }
}
public class Robot implements Workable {
    public String work() { return 'robot assembles parts'; }
    // no eat(), no code(): nothing to fake
}

List<Workable> staff = new List<Workable>{ new Developer(), new Robot() };
for (Workable w : staff) { System.debug(w.work()); }

Object o = staff.get(0);
if (o instanceof Codable) { System.debug(((Codable) o).code()); }
`);

  add('apex-solid-dip', 'SOLID: Dependency Inversion', 'SOLID', `
// High level code depends on an abstraction, not on a concrete class.
public interface PaymentGateway {
    Boolean charge(Decimal amount);
}
public class CardGateway implements PaymentGateway {
    public Boolean charge(Decimal amount) { System.debug('Charging card ' + amount); return true; }
}
// A test double: lets us test OrderProcessor without a real payment system
public class FakeGateway implements PaymentGateway {
    public List<Decimal> charges = new List<Decimal>();
    public Boolean charge(Decimal amount) { charges.add(amount); return amount < 1000; }
}

public class OrderProcessor {
    private PaymentGateway gateway;
    // The dependency is injected, not created with "new" inside
    public OrderProcessor(PaymentGateway gateway) { this.gateway = gateway; }
    public String checkout(Decimal total) {
        return gateway.charge(total) ? 'PAID' : 'DECLINED';
    }
}

System.debug(new OrderProcessor(new CardGateway()).checkout(80));

// "Unit test" with the fake
FakeGateway fake = new FakeGateway();
OrderProcessor op = new OrderProcessor(fake);
Assert.areEqual('PAID', op.checkout(250));
Assert.areEqual('DECLINED', op.checkout(5000));
Assert.areEqual(2, fake.charges.size());
System.debug('All assertions passed');
`);

  root.FN_APEX_TEMPLATES = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof self !== 'undefined' ? self : this);
