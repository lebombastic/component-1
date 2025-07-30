// New Block - Updated July 30, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function prevent_default(fn) {
    return function (event) {
        event.preventDefault();
        // @ts-ignore
        return fn.call(this, event);
    };
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function to_number(value) {
    return value === '' ? null : +value;
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[38] = list[i];
	return child_ctx;
}

// (683:4) {#if currentTrack}
function create_if_block_4(ctx) {
	let div2;
	let div0;
	let t0_value = /*currentTrack*/ ctx[1].title + "";
	let t0;
	let t1;
	let div1;
	let t2_value = /*currentTrack*/ ctx[1].artist + "";
	let t2;

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			div1 = element("div");
			t2 = text(t2_value);
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, t0_value);
			div0_nodes.forEach(detach);
			t1 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t2 = claim_text(div1_nodes, t2_value);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "track-title svelte-6h45h0");
			attr(div1, "class", "track-artist svelte-6h45h0");
			attr(div2, "class", "player-info svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, t0);
			append_hydration(div2, t1);
			append_hydration(div2, div1);
			append_hydration(div1, t2);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentTrack*/ 2 && t0_value !== (t0_value = /*currentTrack*/ ctx[1].title + "")) set_data(t0, t0_value);
			if (dirty[0] & /*currentTrack*/ 2 && t2_value !== (t2_value = /*currentTrack*/ ctx[1].artist + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) detach(div2);
		}
	};
}

// (755:4) {#if activeTab === 'url'}
function create_if_block_3(ctx) {
	let div;
	let form;
	let input;
	let t0;
	let button;
	let t1_value = (/*isLoadingUrl*/ ctx[10] ? 'Loading...' : 'Load') + "";
	let t1;
	let mounted;
	let dispose;

	return {
		c() {
			div = element("div");
			form = element("form");
			input = element("input");
			t0 = space();
			button = element("button");
			t1 = text(t1_value);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			form = claim_element(div_nodes, "FORM", { class: true });
			var form_nodes = children(form);

			input = claim_element(form_nodes, "INPUT", {
				type: true,
				class: true,
				placeholder: true
			});

			t0 = claim_space(form_nodes);
			button = claim_element(form_nodes, "BUTTON", { type: true, class: true });
			var button_nodes = children(button);
			t1 = claim_text(button_nodes, t1_value);
			button_nodes.forEach(detach);
			form_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(input, "type", "url");
			attr(input, "class", "url-input svelte-6h45h0");
			attr(input, "placeholder", "Enter YouTube URL");
			input.required = true;
			attr(button, "type", "submit");
			attr(button, "class", "load-button svelte-6h45h0");
			button.disabled = /*isLoadingUrl*/ ctx[10];
			attr(form, "class", "input-form svelte-6h45h0");
			attr(div, "class", "tab-content svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, form);
			append_hydration(form, input);
			set_input_value(input, /*urlInput*/ ctx[4]);
			append_hydration(form, t0);
			append_hydration(form, button);
			append_hydration(button, t1);

			if (!mounted) {
				dispose = [
					listen(input, "input", /*input_input_handler*/ ctx[32]),
					listen(form, "submit", prevent_default(/*loadAudioFromUrl*/ ctx[14]))
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*urlInput*/ 16 && input.value !== /*urlInput*/ ctx[4]) {
				set_input_value(input, /*urlInput*/ ctx[4]);
			}

			if (dirty[0] & /*isLoadingUrl*/ 1024 && t1_value !== (t1_value = (/*isLoadingUrl*/ ctx[10] ? 'Loading...' : 'Load') + "")) set_data(t1, t1_value);

			if (dirty[0] & /*isLoadingUrl*/ 1024) {
				button.disabled = /*isLoadingUrl*/ ctx[10];
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (773:4) {#if activeTab === 'search'}
function create_if_block_1(ctx) {
	let div;
	let form;
	let input;
	let t0;
	let button;
	let t1_value = (/*isSearching*/ ctx[11] ? 'Searching...' : 'Search') + "";
	let t1;
	let t2;
	let mounted;
	let dispose;
	let if_block = /*searchResults*/ ctx[2].length > 0 && create_if_block_2(ctx);

	return {
		c() {
			div = element("div");
			form = element("form");
			input = element("input");
			t0 = space();
			button = element("button");
			t1 = text(t1_value);
			t2 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			form = claim_element(div_nodes, "FORM", { class: true });
			var form_nodes = children(form);

			input = claim_element(form_nodes, "INPUT", {
				type: true,
				class: true,
				placeholder: true
			});

			t0 = claim_space(form_nodes);
			button = claim_element(form_nodes, "BUTTON", { type: true, class: true });
			var button_nodes = children(button);
			t1 = claim_text(button_nodes, t1_value);
			button_nodes.forEach(detach);
			form_nodes.forEach(detach);
			t2 = claim_space(div_nodes);
			if (if_block) if_block.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(input, "type", "text");
			attr(input, "class", "url-input svelte-6h45h0");
			attr(input, "placeholder", "Search YouTube");
			input.required = true;
			attr(button, "type", "submit");
			attr(button, "class", "load-button svelte-6h45h0");
			button.disabled = /*isSearching*/ ctx[11];
			attr(form, "class", "input-form svelte-6h45h0");
			attr(div, "class", "tab-content svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, form);
			append_hydration(form, input);
			set_input_value(input, /*searchInput*/ ctx[5]);
			append_hydration(form, t0);
			append_hydration(form, button);
			append_hydration(button, t1);
			append_hydration(div, t2);
			if (if_block) if_block.m(div, null);

			if (!mounted) {
				dispose = [
					listen(input, "input", /*input_input_handler_1*/ ctx[33]),
					listen(form, "submit", prevent_default(/*searchYouTube*/ ctx[15]))
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*searchInput*/ 32 && input.value !== /*searchInput*/ ctx[5]) {
				set_input_value(input, /*searchInput*/ ctx[5]);
			}

			if (dirty[0] & /*isSearching*/ 2048 && t1_value !== (t1_value = (/*isSearching*/ ctx[11] ? 'Searching...' : 'Search') + "")) set_data(t1, t1_value);

			if (dirty[0] & /*isSearching*/ 2048) {
				button.disabled = /*isSearching*/ ctx[11];
			}

			if (/*searchResults*/ ctx[2].length > 0) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_2(ctx);
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (788:8) {#if searchResults.length > 0}
function create_if_block_2(ctx) {
	let div;
	let each_value = /*searchResults*/ ctx[2];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "search-results svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectResult, searchResults*/ 524292) {
				each_value = /*searchResults*/ ctx[2];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (790:12) {#each searchResults as result}
function create_each_block(ctx) {
	let div4;
	let div0;
	let i;
	let t0;
	let div3;
	let div1;
	let t1_value = /*result*/ ctx[38].title + "";
	let t1;
	let t2;
	let div2;
	let t3_value = /*result*/ ctx[38].artist + "";
	let t3;
	let t4;
	let t5_value = /*result*/ ctx[38].duration + "";
	let t5;
	let t6;
	let mounted;
	let dispose;

	function click_handler_2() {
		return /*click_handler_2*/ ctx[34](/*result*/ ctx[38]);
	}

	function keydown_handler_1(...args) {
		return /*keydown_handler_1*/ ctx[35](/*result*/ ctx[38], ...args);
	}

	return {
		c() {
			div4 = element("div");
			div0 = element("div");
			i = element("i");
			t0 = space();
			div3 = element("div");
			div1 = element("div");
			t1 = text(t1_value);
			t2 = space();
			div2 = element("div");
			t3 = text(t3_value);
			t4 = text(" • ");
			t5 = text(t5_value);
			t6 = space();
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true, tabindex: true, role: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			i = claim_element(div0_nodes, "I", { class: true });
			children(i).forEach(detach);
			div0_nodes.forEach(detach);
			t0 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t1 = claim_text(div1_nodes, t1_value);
			div1_nodes.forEach(detach);
			t2 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			t3 = claim_text(div2_nodes, t3_value);
			t4 = claim_text(div2_nodes, " • ");
			t5 = claim_text(div2_nodes, t5_value);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t6 = claim_space(div4_nodes);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-play svelte-6h45h0");
			attr(div0, "class", "result-thumbnail svelte-6h45h0");
			attr(div1, "class", "result-title svelte-6h45h0");
			attr(div2, "class", "result-meta svelte-6h45h0");
			attr(div3, "class", "result-info svelte-6h45h0");
			attr(div4, "class", "result-item svelte-6h45h0");
			attr(div4, "tabindex", "0");
			attr(div4, "role", "button");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div0);
			append_hydration(div0, i);
			append_hydration(div4, t0);
			append_hydration(div4, div3);
			append_hydration(div3, div1);
			append_hydration(div1, t1);
			append_hydration(div3, t2);
			append_hydration(div3, div2);
			append_hydration(div2, t3);
			append_hydration(div2, t4);
			append_hydration(div2, t5);
			append_hydration(div4, t6);

			if (!mounted) {
				dispose = [
					listen(div4, "click", click_handler_2),
					listen(div4, "keydown", keydown_handler_1)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*searchResults*/ 4 && t1_value !== (t1_value = /*result*/ ctx[38].title + "")) set_data(t1, t1_value);
			if (dirty[0] & /*searchResults*/ 4 && t3_value !== (t3_value = /*result*/ ctx[38].artist + "")) set_data(t3, t3_value);
			if (dirty[0] & /*searchResults*/ 4 && t5_value !== (t5_value = /*result*/ ctx[38].duration + "")) set_data(t5, t5_value);
		},
		d(detaching) {
			if (detaching) detach(div4);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (814:0) {#if toast.show}
function create_if_block(ctx) {
	let div;
	let t_value = /*toast*/ ctx[12].message + "";
	let t;
	let div_class_value;

	return {
		c() {
			div = element("div");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			t = claim_text(div_nodes, t_value);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", div_class_value = "toast " + /*toast*/ ctx[12].type + " svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*toast*/ 4096 && t_value !== (t_value = /*toast*/ ctx[12].message + "")) set_data(t, t_value);

			if (dirty[0] & /*toast*/ 4096 && div_class_value !== (div_class_value = "toast " + /*toast*/ ctx[12].type + " svelte-6h45h0")) {
				attr(div, "class", div_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let section;
	let div10;
	let header;
	let h1;
	let t0;
	let t1;
	let p;
	let t2;
	let t3;
	let div7;
	let t4;
	let div5;
	let div0;
	let t5_value = formatTime(/*currentTime*/ ctx[6]) + "";
	let t5;
	let t6;
	let div3;
	let div1;
	let t7;
	let div2;
	let div3_aria_valuenow_value;
	let t8;
	let div4;
	let t9_value = formatTime(/*totalTime*/ ctx[7]) + "";
	let t9;
	let t10;
	let div6;
	let button0;
	let i0;
	let i0_class_value;
	let t11;
	let i1;
	let t12;
	let input;
	let t13;
	let audio;
	let t14;
	let div9;
	let div8;
	let button1;
	let i2;
	let t15;
	let button1_class_value;
	let t16;
	let button2;
	let i3;
	let t17;
	let button2_class_value;
	let t18;
	let t19;
	let t20;
	let mounted;
	let dispose;
	let if_block0 = /*currentTrack*/ ctx[1] && create_if_block_4(ctx);
	let if_block1 = /*activeTab*/ ctx[3] === 'url' && create_if_block_3(ctx);
	let if_block2 = /*activeTab*/ ctx[3] === 'search' && create_if_block_1(ctx);
	let if_block3 = /*toast*/ ctx[12].show && create_if_block(ctx);

	return {
		c() {
			section = element("section");
			div10 = element("div");
			header = element("header");
			h1 = element("h1");
			t0 = text("YouTube Audio Player");
			t1 = space();
			p = element("p");
			t2 = text("Paste a YouTube URL and enjoy the audio in a clean, distraction-free player.");
			t3 = space();
			div7 = element("div");
			if (if_block0) if_block0.c();
			t4 = space();
			div5 = element("div");
			div0 = element("div");
			t5 = text(t5_value);
			t6 = space();
			div3 = element("div");
			div1 = element("div");
			t7 = space();
			div2 = element("div");
			t8 = space();
			div4 = element("div");
			t9 = text(t9_value);
			t10 = space();
			div6 = element("div");
			button0 = element("button");
			i0 = element("i");
			t11 = space();
			i1 = element("i");
			t12 = space();
			input = element("input");
			t13 = space();
			audio = element("audio");
			t14 = space();
			div9 = element("div");
			div8 = element("div");
			button1 = element("button");
			i2 = element("i");
			t15 = text("\n        URL Input");
			t16 = space();
			button2 = element("button");
			i3 = element("i");
			t17 = text("\n        Search YouTube");
			t18 = space();
			if (if_block1) if_block1.c();
			t19 = space();
			if (if_block2) if_block2.c();
			t20 = space();
			if (if_block3) if_block3.c();
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div10 = claim_element(section_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			header = claim_element(div10_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			h1 = claim_element(header_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "YouTube Audio Player");
			h1_nodes.forEach(detach);
			t1 = claim_space(header_nodes);
			p = claim_element(header_nodes, "P", { class: true });
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, "Paste a YouTube URL and enjoy the audio in a clean, distraction-free player.");
			p_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t3 = claim_space(div10_nodes);
			div7 = claim_element(div10_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			if (if_block0) if_block0.l(div7_nodes);
			t4 = claim_space(div7_nodes);
			div5 = claim_element(div7_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div0 = claim_element(div5_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t5 = claim_text(div0_nodes, t5_value);
			div0_nodes.forEach(detach);
			t6 = claim_space(div5_nodes);

			div3 = claim_element(div5_nodes, "DIV", {
				class: true,
				tabindex: true,
				role: true,
				"aria-label": true,
				"aria-valuenow": true,
				"aria-valuemin": true,
				"aria-valuemax": true
			});

			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true, style: true });
			children(div1).forEach(detach);
			t7 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true, style: true });
			children(div2).forEach(detach);
			div3_nodes.forEach(detach);
			t8 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			t9 = claim_text(div4_nodes, t9_value);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t10 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			button0 = claim_element(div6_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			i0 = claim_element(button0_nodes, "I", { class: true });
			children(i0).forEach(detach);
			button0_nodes.forEach(detach);
			t11 = claim_space(div6_nodes);
			i1 = claim_element(div6_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t12 = claim_space(div6_nodes);

			input = claim_element(div6_nodes, "INPUT", {
				type: true,
				class: true,
				min: true,
				max: true
			});

			div6_nodes.forEach(detach);
			t13 = claim_space(div7_nodes);
			audio = claim_element(div7_nodes, "AUDIO", { preload: true, class: true });
			children(audio).forEach(detach);
			div7_nodes.forEach(detach);
			t14 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			button1 = claim_element(div8_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			i2 = claim_element(button1_nodes, "I", { class: true });
			children(i2).forEach(detach);
			t15 = claim_text(button1_nodes, "\n        URL Input");
			button1_nodes.forEach(detach);
			t16 = claim_space(div8_nodes);
			button2 = claim_element(div8_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			i3 = claim_element(button2_nodes, "I", { class: true });
			children(i3).forEach(detach);
			t17 = claim_text(button2_nodes, "\n        Search YouTube");
			button2_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t18 = claim_space(div9_nodes);
			if (if_block1) if_block1.l(div9_nodes);
			t19 = claim_space(div9_nodes);
			if (if_block2) if_block2.l(div9_nodes);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t20 = claim_space(section_nodes);
			if (if_block3) if_block3.l(section_nodes);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-6h45h0");
			attr(p, "class", "svelte-6h45h0");
			attr(header, "class", "header svelte-6h45h0");
			attr(div0, "class", "time-display svelte-6h45h0");
			attr(div1, "class", "progress-bar svelte-6h45h0");
			set_style(div1, "width", /*progress*/ ctx[9] + "%");
			attr(div2, "class", "progress-handle svelte-6h45h0");
			set_style(div2, "left", /*progress*/ ctx[9] + "%");
			attr(div3, "class", "progress-container svelte-6h45h0");
			attr(div3, "tabindex", "0");
			attr(div3, "role", "slider");
			attr(div3, "aria-label", "Seek audio position");
			attr(div3, "aria-valuenow", div3_aria_valuenow_value = Math.round(/*progress*/ ctx[9]));
			attr(div3, "aria-valuemin", "0");
			attr(div3, "aria-valuemax", "100");
			attr(div4, "class", "time-display svelte-6h45h0");
			attr(div5, "class", "audio-controls svelte-6h45h0");
			attr(i0, "class", i0_class_value = "fas " + (/*isPlaying*/ ctx[0] ? 'fa-pause' : 'fa-play') + " svelte-6h45h0");
			attr(button0, "class", "play-button svelte-6h45h0");
			attr(i1, "class", "fas fa-volume-up volume-icon svelte-6h45h0");
			attr(input, "type", "range");
			attr(input, "class", "volume-slider svelte-6h45h0");
			attr(input, "min", "0");
			attr(input, "max", "100");
			attr(div6, "class", "volume-controls svelte-6h45h0");
			attr(audio, "preload", "metadata");
			attr(audio, "class", "svelte-6h45h0");
			attr(div7, "class", "player-container svelte-6h45h0");
			attr(i2, "class", "fas fa-link svelte-6h45h0");
			attr(button1, "class", button1_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'url' ? 'active' : '') + " svelte-6h45h0");
			attr(i3, "class", "fas fa-search svelte-6h45h0");
			attr(button2, "class", button2_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'search' ? 'active' : '') + " svelte-6h45h0");
			attr(div8, "class", "input-tabs svelte-6h45h0");
			attr(div9, "class", "input-container svelte-6h45h0");
			attr(div10, "class", "app-container svelte-6h45h0");
			attr(section, "class", "svelte-6h45h0");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div10);
			append_hydration(div10, header);
			append_hydration(header, h1);
			append_hydration(h1, t0);
			append_hydration(header, t1);
			append_hydration(header, p);
			append_hydration(p, t2);
			append_hydration(div10, t3);
			append_hydration(div10, div7);
			if (if_block0) if_block0.m(div7, null);
			append_hydration(div7, t4);
			append_hydration(div7, div5);
			append_hydration(div5, div0);
			append_hydration(div0, t5);
			append_hydration(div5, t6);
			append_hydration(div5, div3);
			append_hydration(div3, div1);
			append_hydration(div3, t7);
			append_hydration(div3, div2);
			append_hydration(div5, t8);
			append_hydration(div5, div4);
			append_hydration(div4, t9);
			append_hydration(div7, t10);
			append_hydration(div7, div6);
			append_hydration(div6, button0);
			append_hydration(button0, i0);
			append_hydration(div6, t11);
			append_hydration(div6, i1);
			append_hydration(div6, t12);
			append_hydration(div6, input);
			set_input_value(input, /*volume*/ ctx[8]);
			append_hydration(div7, t13);
			append_hydration(div7, audio);
			/*audio_binding*/ ctx[29](audio);
			append_hydration(div10, t14);
			append_hydration(div10, div9);
			append_hydration(div9, div8);
			append_hydration(div8, button1);
			append_hydration(button1, i2);
			append_hydration(button1, t15);
			append_hydration(div8, t16);
			append_hydration(div8, button2);
			append_hydration(button2, i3);
			append_hydration(button2, t17);
			append_hydration(div9, t18);
			if (if_block1) if_block1.m(div9, null);
			append_hydration(div9, t19);
			if (if_block2) if_block2.m(div9, null);
			append_hydration(section, t20);
			if (if_block3) if_block3.m(section, null);

			if (!mounted) {
				dispose = [
					listen(div3, "click", /*seekAudio*/ ctx[17]),
					listen(div3, "keydown", /*keydown_handler*/ ctx[27]),
					listen(button0, "click", /*togglePlayPause*/ ctx[16]),
					listen(input, "change", /*input_change_input_handler*/ ctx[28]),
					listen(input, "input", /*input_change_input_handler*/ ctx[28]),
					listen(input, "input", /*updateVolume*/ ctx[18]),
					listen(audio, "play", /*onPlay*/ ctx[20]),
					listen(audio, "pause", /*onPause*/ ctx[21]),
					listen(audio, "timeupdate", /*onTimeUpdate*/ ctx[22]),
					listen(audio, "loadedmetadata", /*onLoadedMetadata*/ ctx[23]),
					listen(audio, "error", /*onError*/ ctx[24]),
					listen(button1, "click", /*click_handler*/ ctx[30]),
					listen(button2, "click", /*click_handler_1*/ ctx[31])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*currentTrack*/ ctx[1]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_4(ctx);
					if_block0.c();
					if_block0.m(div7, t4);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*currentTime*/ 64 && t5_value !== (t5_value = formatTime(/*currentTime*/ ctx[6]) + "")) set_data(t5, t5_value);

			if (dirty[0] & /*progress*/ 512) {
				set_style(div1, "width", /*progress*/ ctx[9] + "%");
			}

			if (dirty[0] & /*progress*/ 512) {
				set_style(div2, "left", /*progress*/ ctx[9] + "%");
			}

			if (dirty[0] & /*progress*/ 512 && div3_aria_valuenow_value !== (div3_aria_valuenow_value = Math.round(/*progress*/ ctx[9]))) {
				attr(div3, "aria-valuenow", div3_aria_valuenow_value);
			}

			if (dirty[0] & /*totalTime*/ 128 && t9_value !== (t9_value = formatTime(/*totalTime*/ ctx[7]) + "")) set_data(t9, t9_value);

			if (dirty[0] & /*isPlaying*/ 1 && i0_class_value !== (i0_class_value = "fas " + (/*isPlaying*/ ctx[0] ? 'fa-pause' : 'fa-play') + " svelte-6h45h0")) {
				attr(i0, "class", i0_class_value);
			}

			if (dirty[0] & /*volume*/ 256) {
				set_input_value(input, /*volume*/ ctx[8]);
			}

			if (dirty[0] & /*activeTab*/ 8 && button1_class_value !== (button1_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'url' ? 'active' : '') + " svelte-6h45h0")) {
				attr(button1, "class", button1_class_value);
			}

			if (dirty[0] & /*activeTab*/ 8 && button2_class_value !== (button2_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'search' ? 'active' : '') + " svelte-6h45h0")) {
				attr(button2, "class", button2_class_value);
			}

			if (/*activeTab*/ ctx[3] === 'url') {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_3(ctx);
					if_block1.c();
					if_block1.m(div9, t19);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*activeTab*/ ctx[3] === 'search') {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_1(ctx);
					if_block2.c();
					if_block2.m(div9, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (/*toast*/ ctx[12].show) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block(ctx);
					if_block3.c();
					if_block3.m(section, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section);
			if (if_block0) if_block0.d();
			/*audio_binding*/ ctx[29](null);
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function isValidYouTubeUrl(url) {
	const patterns = [
		/^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
		/^https?:\/\/youtu\.be\/[\w-]+/,
		/^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/
	];

	return patterns.some(pattern => pattern.test(url));
}

function extractVideoId(url) {
	const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}

	return null;
}

function formatTime(seconds) {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function getVideoInfo(videoId) {
	// Mock response for demo
	return {
		title: 'Demo Audio Track',
		author: 'Demo Channel',
		duration: 180,
		formats: [
			{
				itag: 140,
				mimeType: 'audio/mp4',
				bitrate: 128,
				url: 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3',
				hasAudio: true,
				hasVideo: false
			}
		]
	};
}

function chooseAudioFormat(formats) {
	return formats.find(format => format.hasAudio && !format.hasVideo) || formats[0];
}

async function GET({ params }) {
	try {
		const { videoId } = params;
		const info = await ytdl.getInfo(videoId);

		return new Response(JSON.stringify({
				title: info.videoDetails.title,
				author: info.videoDetails.author.name,
				duration: parseInt(info.videoDetails.lengthSeconds),
				formats: info.formats.filter(format => format.hasAudio)
			}));
	} catch(error) {
		return new Response(JSON.stringify({ error: error.message }), { status: 500 });
	}
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// Application State
	let isPlaying = false;

	let currentTrack = null;
	let searchResults = [];
	let activeTab = 'url';

	// Form inputs
	let urlInput = '';

	let searchInput = '';

	// Player state
	let currentTime = 0;

	let totalTime = 0;
	let volume = 50;
	let progress = 0;

	// Loading states
	let isLoadingUrl = false;

	let isSearching = false;

	// Toast notification
	let toast = {
		show: false,
		message: '',
		type: 'success'
	};

	// Audio element reference
	let audioElement;

	function showToast(message, type = 'success') {
		$$invalidate(12, toast = { show: true, message, type });

		setTimeout(
			() => {
				$$invalidate(12, toast.show = false, toast);
			},
			3000
		);
	}

	// Audio Loading Functions
	async function loadAudioFromUrl() {
		if (!urlInput.trim()) {
			showToast('Please enter a YouTube URL', 'error');
			return;
		}

		if (!isValidYouTubeUrl(urlInput)) {
			showToast('Please enter a valid YouTube URL', 'error');
			return;
		}

		$$invalidate(10, isLoadingUrl = true);

		try {
			showToast('Loading audio...', 'warning');
			const videoId = extractVideoId(urlInput);
			const videoInfo = await getVideoInfo(videoId);
			const audioFormat = chooseAudioFormat(videoInfo.formats);

			if (!audioFormat) {
				throw new Error('No audio stream available');
			}

			const audioData = {
				title: videoInfo.title,
				artist: videoInfo.author,
				duration: videoInfo.duration,
				audioUrl: audioFormat.url,
				videoId
			};

			loadAudio(audioData);
			showToast('Audio loaded successfully!', 'success');
		} catch(error) {
			console.error('Loading error:', error);
			showToast(`Failed to load audio: ${error.message}`, 'error');
		} finally {
			$$invalidate(10, isLoadingUrl = false);
		}
	}

	async function searchYouTube() {
		if (!searchInput.trim()) {
			showToast('Please enter a search query', 'error');
			return;
		}

		$$invalidate(11, isSearching = true);

		try {
			// Simulate search
			await new Promise(resolve => setTimeout(resolve, 1500));

			$$invalidate(2, searchResults = [
				{
					id: '1',
					title: `${searchInput} - Official Music Video`,
					artist: 'Official Artist',
					duration: '3:45',
					url: 'https://youtube.com/watch?v=demo1'
				},
				{
					id: '2',
					title: `${searchInput} (Acoustic Version)`,
					artist: 'Acoustic Sessions',
					duration: '4:12',
					url: 'https://youtube.com/watch?v=demo2'
				}
			]);

			showToast(`Found ${searchResults.length} results`, 'success');
		} catch(error) {
			showToast('Search failed', 'error');
		} finally {
			$$invalidate(11, isSearching = false);
		}
	}

	function loadAudio(audioData) {
		$$invalidate(1, currentTrack = audioData);
		$$invalidate(13, audioElement.src = audioData.audioUrl, audioElement);
	}

	// Player Controls
	function togglePlayPause() {
		if (!currentTrack) {
			showToast('Please load a track first', 'warning');
			return;
		}

		if (isPlaying) {
			audioElement.pause();
		} else {
			audioElement.play();
		}
	}

	function seekAudio(e) {
		if (!currentTrack) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		const seekTime = percent * audioElement.duration;
		$$invalidate(13, audioElement.currentTime = seekTime, audioElement);
	}

	function updateVolume() {
		$$invalidate(13, audioElement.volume = volume / 100, audioElement);
	}

	function selectResult(result) {
		$$invalidate(4, urlInput = result.url);
		loadAudioFromUrl();
	}

	// Audio Event Handlers
	function onPlay() {
		$$invalidate(0, isPlaying = true);
	}

	function onPause() {
		$$invalidate(0, isPlaying = false);
	}

	function onTimeUpdate() {
		$$invalidate(6, currentTime = audioElement.currentTime);

		if (audioElement.duration) {
			$$invalidate(9, progress = currentTime / audioElement.duration * 100);
		}
	}

	function onLoadedMetadata() {
		$$invalidate(7, totalTime = audioElement.duration);
	}

	function onError() {
		showToast('Failed to load audio', 'error');
		$$invalidate(0, isPlaying = false);
	}

	onMount(() => {
		updateVolume();
		showToast('Audio Player ready!', 'success');
	});

	const keydown_handler = e => e.key === 'Enter' && seekAudio(e);

	function input_change_input_handler() {
		volume = to_number(this.value);
		$$invalidate(8, volume);
	}

	function audio_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			audioElement = $$value;
			$$invalidate(13, audioElement);
		});
	}

	const click_handler = () => $$invalidate(3, activeTab = 'url');
	const click_handler_1 = () => $$invalidate(3, activeTab = 'search');

	function input_input_handler() {
		urlInput = this.value;
		$$invalidate(4, urlInput);
	}

	function input_input_handler_1() {
		searchInput = this.value;
		$$invalidate(5, searchInput);
	}

	const click_handler_2 = result => selectResult(result);
	const keydown_handler_1 = (result, e) => e.key === 'Enter' && selectResult(result);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(25, props = $$props.props);
	};

	return [
		isPlaying,
		currentTrack,
		searchResults,
		activeTab,
		urlInput,
		searchInput,
		currentTime,
		totalTime,
		volume,
		progress,
		isLoadingUrl,
		isSearching,
		toast,
		audioElement,
		loadAudioFromUrl,
		searchYouTube,
		togglePlayPause,
		seekAudio,
		updateVolume,
		selectResult,
		onPlay,
		onPause,
		onTimeUpdate,
		onLoadedMetadata,
		onError,
		props,
		GET,
		keydown_handler,
		input_change_input_handler,
		audio_binding,
		click_handler,
		click_handler_1,
		input_input_handler,
		input_input_handler_1,
		click_handler_2,
		keydown_handler_1
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 25, GET: 26 }, null, [-1, -1]);
	}

	get GET() {
		return GET;
	}
}

export { Component as default };
