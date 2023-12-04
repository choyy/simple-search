const siyuan = require("siyuan");

function translateSearchInput(search_keywords) {
    if (search_keywords.length < 2 || search_keywords.match("^-[wqrs]") != null) {
        return search_keywords;
    }
    let input_text_items            = search_keywords.split(" ");
    let key_words                   = [];                          // 搜索关键词
    let excluded_key_words          = [];                          // 排除的关键词
    let options                     = "";                          // 搜索选项
    let if_options_exist            = false;
    let if_excluded_key_words_exist = false;
    for (let i = 0; i < input_text_items.length; i++) {
        if (input_text_items[i] == "" || input_text_items[i] == "-") {
            continue;
        } else if (input_text_items[i].match(/^-[kKedhlptbsicm1-6]+$/) != null) { // k为当前文档搜索，e为扩展搜索，其他为块类型
            options += input_text_items[i].substring(1, input_text_items[i].length);
            if_options_exist = true;
        }
        else if (input_text_items[i].match(/^-.+/) != null) {
            excluded_key_words.push(input_text_items[i].substring(1, input_text_items[i].length));
            if_excluded_key_words_exist = true;
        }
        else {
            key_words.push(input_text_items[i]);
        }
    }
    if ((!if_options_exist) && (!if_excluded_key_words_exist)) {
        return "-w" + search_keywords; // 仅有关键词时使用关键词查询
    } else if ((!if_options_exist) && (if_excluded_key_words_exist)) {
        let query_syntax = "-q";  // 仅有关键词和排除关键词是使用查询语法查询
        for (let i = 0; i < key_words.length; i++) {
            query_syntax += " " + key_words[i];
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            query_syntax += " NOT " + excluded_key_words[i];
        }
        return query_syntax;
    }
    let sql_default_order_by = "order by case type \
 when 'd' then 1\
 when 'h' then 2\
 when 'i' then 3\
 when 'p' then 4\
 when 't' then 5\
 when 'b' then 6\
 when 'c' then 7\
 when 'm' then 8\
 when 'l' then 9\
 when 's' then 10\
 when 'html' then 11\
 when 'widget' then 12\
 when 'query_embed' then 13\
 when 'iframe' then 14\
 end, updated desc";
    // 判断是否扩展范围搜索，若是则直接返回扩展范围搜索的sql语句
    if (options.match(/e/) != null) {
        let sql_extended_search = "select path from blocks where type ='d' ";
        let sql_content_like = "";
        for (let i = 0; i < key_words.length; i++) {
            sql_extended_search += "and path in (select path from blocks where content like '%" + key_words[i] + "%') ";
            sql_content_like += "content like '%" + key_words[i] + "%' or ";
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            sql_extended_search += "and path not in (select path from blocks where content like '%" + excluded_key_words[i] + "%') ";
        }
        return "-s" + "select * from blocks where path in (" +
            sql_extended_search + ") and (" + sql_content_like.slice(0, -4) + ") and type not rlike '^[libs]$'" + // l i b s块类型不是叶子节点，重复
            sql_default_order_by;
    }

    // 一般搜索模式
    // sql 首部分
    let sql_prefix = "select * from blocks where ";
    // sql 搜索关键词
    let sql_key_words = "";
    if (key_words.length != 0) {
        sql_key_words += "content like '%" + key_words[0] + "%' ";
        for (let i = 1; i < key_words.length; i++) {
            sql_key_words += "and content like '%" + key_words[i] + "%' ";
        }
    }
    for (let i = 0; i < excluded_key_words.length; i++) {
        sql_key_words += "and content not like '%" + excluded_key_words[i] + "%' ";
    }
    if (sql_key_words != "") {
        sql_key_words = "(" + sql_key_words + ") ";
    } else {
        return "-w"
    }
    // 搜索类型
    let sql_current_doc = "";
    if (options.match(/[kK]/) != null) {  // 当前文档或带子文档搜索
        let current_doc_id = document.querySelector(".fn__flex-1.protyle:not(.fn__none)").childNodes[1].childNodes[0].getAttribute("data-node-id");
        if (options.match(/K/) != null) { // 在当前文档及子文档搜索
            sql_current_doc = "and path rlike '" + current_doc_id + "' ";
        } else {                          // 在当前文档搜索
            sql_current_doc = "and path like '%" + current_doc_id + ".sy' ";
        }
        options = options.replace(/[kK]/g, "");
    } 
    let sql_types = options;
    let sql_type_rlike = "";
    if (sql_types != "") {
        if (sql_types.match(/[1-6]/) == null) {
            sql_type_rlike = "and type rlike '^[" + sql_types + "]$' ";
        }
        else {
            if (sql_types.replace(/[h1-6]/g, "") == "") {
                sql_type_rlike = "and subtype rlike '^h[" + sql_types.replace(/[^\d]/g, "") + "]$' ";
            } else {
                sql_type_rlike = "and (type rlike '^[" + sql_types.replace(/[h1-6]/g, "") + "]$' \
or subtype rlike '^h[" + sql_types.replace(/[^\d]/g, "") + "]$') ";
            }
            sql_types = sql_types.replace(/[1-6]/g, "");
        }
    }
    // 排序
    let sql_order_by = "order by case type";
    const type_order = {
        "d": " when 'd' then ",
        "h": " when 'h' then ",
        "i": " when 'i' then ",
        "p": " when 'p' then ",
        "t": " when 't' then ",
        "b": " when 'b' then ",
        "c": " when 'c' then ",
        "m": " when 'm' then ",
        "l": " when 'l' then ",
        "s": " when 's' then ",
    }
    if (sql_types != "") {
        for (let i = 0; i < sql_types.length; i++) {
            sql_order_by += type_order[sql_types[i]] + i.toString();
        }
        sql_order_by += " end, updated desc";
    } else {
        sql_order_by = sql_default_order_by;
    }

    // 完整sql语句
    return "-s" + sql_prefix + sql_key_words + sql_type_rlike + sql_current_doc + sql_order_by;
}
let last_search_method = -1;
function switchSearchMethod(i) {
    if (last_search_method != i) {
        document.querySelector("#searchSyntaxCheck").click();
        document.querySelector("#commonMenu").lastChild.childNodes[i].click();
        last_search_method = i;
    }
}

let observer;
class SimpleSearch extends siyuan.Plugin {
    onLayoutReady() {
        // 选择需要观察变动的节点
        const global_search_node = document.querySelector("body");
        const tab_search_node = document.querySelector(".layout__center");
        // 监视子节点的增减
        const observer_conf = { childList: true, subtree: false };
        // 当观察到变动时执行的回调函数
        // 即当搜索界面打开时，插入新搜索框，隐藏原搜索框，然后将新搜索框内容转成sql后填入原搜索框
        const input_event = new InputEvent("input");
        let search_keywords = "";
        let if_search_keywords_changed = false;
        const operationsAfterOpenSearch = function () {
            last_search_method = -1; // 每次打开搜索都要设置搜索方法
            // 插入新搜索框，隐藏原搜索框
            let originalSearchInput = document.getElementById("searchInput");
            let simpleSearchInput = originalSearchInput.cloneNode();
            simpleSearchInput.id = "simpleSearchInput";
            simpleSearchInput.value = "";
            originalSearchInput.before(simpleSearchInput);
            originalSearchInput.style.display = "none";
            const input_event_func = function () {
                search_keywords = simpleSearchInput.value;
                if_search_keywords_changed = true;
                if (search_keywords.length < 2) {
                    switchSearchMethod(0);
                    originalSearchInput.value = search_keywords;
                } else {
                    let input_translated = translateSearchInput(search_keywords);
                    switch (input_translated.substring(0, 2)) {
                        case "-w": switchSearchMethod(0); break;
                        case "-q": switchSearchMethod(1); break;
                        case "-s": switchSearchMethod(2); break;
                        case "-r": switchSearchMethod(3); break;
                    }
                    originalSearchInput.value = input_translated.slice(2, input_translated.length);
                }
                originalSearchInput.dispatchEvent(input_event);
            }
            const keyboard_event_func = function (event) {
                switch (event.keyCode) {
                    case 13:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 13, "code": "KeyEnter", "key": "Enter" }));
                        break;
                    case 38:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 38, "code": "KeyArrowUp", "key": "ArrowUp" }));
                        return false; // 禁用方向键原跳到行首功能
                    case 40:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 40, "code": "KeyArrowDown", "key": "ArrowDown" }));
                        return false; // 禁用方向键原跳到行尾功能
                }
            }
            this.loadData("simple_search_keywords").then((data) => {
                simpleSearchInput.value = data;
                input_event_func();
                simpleSearchInput.focus();  // 聚焦到输入框
                simpleSearchInput.select(); // 选择框内内容

                // 当在输入框中按下键的时候，将搜索框内容转成sql后填入原搜索框
                search_keywords = simpleSearchInput.value;
                simpleSearchInput.oninput = input_event_func; // 监听input事件
                simpleSearchInput.onkeydown = keyboard_event_func; // enter键打开搜索结果，上下键选择
            });
        }.bind(this);
        const openSearchCallback = function (mutationsList) {
            for (let i = 0; i < mutationsList.length; i++) {
                if (mutationsList[i].addedNodes.length == 0) return;
                if (mutationsList[i].addedNodes[0].getAttribute('data-key') == window.siyuan.config.keymap.general.globalSearch.custom) {// 判断全局搜索
                    operationsAfterOpenSearch(); 
                    document.querySelector("#searchOpen").onclick = function(){
                        this.saveData("simple_search_keywords", search_keywords); // 保存查询关键词
                    }.bind(this);
                    break;
                } else if (mutationsList[i].addedNodes[0].className == "fn__flex-1 fn__flex"  // 判断搜索页签
                    && mutationsList[i].addedNodes[0].innerText == "搜索\n包含子文档") {
                    operationsAfterOpenSearch(); break;
                } else {
                    if (typeof (search_keywords) !== 'undefined' && search_keywords !== "" && if_search_keywords_changed) {
                        this.saveData("simple_search_keywords", search_keywords); // 保存查询关键词
                        if_search_keywords_changed = false;
                        break;
                    }
                }
            }
        }.bind(this);

        // 创建一个观察器实例并传入回调函数
        observer = new MutationObserver(openSearchCallback);
        // 开始观察目标节点
        observer.observe(global_search_node, observer_conf);
        observer.observe(tab_search_node, observer_conf);
        console.log("simple search start...")
    }

    onunload() {
        // 停止观察目标节点
        observer.disconnect();
        console.log("simple search plugin stop...")
    }
};

module.exports = {
    default: SimpleSearch,
};