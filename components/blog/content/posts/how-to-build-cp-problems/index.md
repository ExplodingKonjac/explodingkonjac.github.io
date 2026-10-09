---
title: 如何造题：Makefile is All You Need
description: 介绍 GNU make 的依赖管理与常用语法，并用 Makefile 组织竞赛题目的编译、数据生成、校验与答案构建流程。
pubDate: 2026-10-07
tags: [competitive-programming, problem-setting, Makefile, automation]
draft: false
---

## 引言

如果你是一个命题人，那么给题目造数据一定是一个逃不开的事。很多时候造数据是一个很烦人且容易出锅：数据范围和 subtask 分布常常修改、std 出锅需要重跑、gen 写错数据格式等等。

当然，我们有很多的工具软件来帮助我们造数据，比如 Polygon、Tuack 等等，但是这些工具某种程度上来讲过于重量级且低效了。因此，为了高效、简洁地解决造题的困境，笔者提出一种全新思路：Makefile is All You Need。

## Makefile 简介

### 什么是 Makefile

简而言之，Makefile 是控制 GNU make 工具行为的一个文件。GNU make 是一个构建工具，其作用是管理项目的构建逻辑。对于 OIer 所熟悉的单文件项目，我们只需要一条命令就可以完成编译，此时自然用不到 make。但是真实项目往往更加复杂。项目的头文件、源文件被分割成多个模块，其间可能有复杂的依赖关系，有可能还要链接第三方库。此时我们就需要用 make 来精确解析依赖关系，并计算出最高效的构建工作流。而 Makefile 就是用于定义这个构建流的文件。

在 C/C++ 项目中，比较为人熟知的构建工具是 CMake，而 CMake 的底层实际上也是将高层的构建逻辑“翻译”成 Makefile。

### Makefile 语法简介

接下来我们讲解本篇文章所用到的 Makefile 语法。我们以下面这样的一个简单项目来做说明：

```plain
example-project/
├── build/
├── src/
│   ├── lib1.cpp
│   ├── lib1.h
│   ├── lib2.cpp
│   ├── lib2.h
│   └── main.cpp
└── Makefile
```

这里面，`src/` 目录下放置的是源代码，`lib1.*`, `lib2.*` 是两个模块的头文件和源文件；`main.cpp` 是主程序的源文件；`build/` 目录下放置构建的产物；`Makefile` 就是 Makefile，它控制构建的行为。

#### 目标定义

Makefile 以“目标（target）”这个抽象概念来构建项目。一个“目标”就是磁盘上的一个文件路径，这个文件存在就说明这个目标被构建了，反之亦然（除了一些特殊情况）。

我们开始编辑 Makefile。定义目标的语法相当简单：

```makefile
build/main: src/main.cpp src/lib1.h src/lib2.h src/lib1.cpp src/lib2.cpp
	g++ src/main.cpp src/lib1.cpp src/lib2.cpp -I src -o build/main
```

编辑完成之后执行 `make main` 就可以编译出可执行文件 `build/main` 了。

可以看到，定义目标的方式就是：

```makefile
<target-name>: <dependency-1> <dependency-2> ...
	<command-1>
	<command-2>
	...
```

这说明 `<target-name>` 依赖于 `<dependency-1>`, `<dependency-2>`, ... 这些文件/目标，并且由 `<command-1>`, `<command-2>`, ... 这些命令生成。这样的一整个结构被称为一个生成规则。

执行命令 `make` 时，make 会尝试构建 Makefile 中第一个目标。执行命令 `make <target-name>` 即可构建指定目标。

#### 组织依赖

为了让项目结构更加清晰，我们可以修改上面的代码，让项目更加结构化：

```makefile
build/lib1.o: src/lib1.cpp src/lib1.h
	g++ src/lib1.cpp -I src -c -o build/lib1.o

build/lib2.o: src/lib2.cpp src/lib2.h
	g++ src/lib2.cpp -I src -c -o build/lib2.o

build/main: build/lib1.o build/lib2.o src/main.cpp
	g++ build/lib1.o build/lib2.o src/main.cpp -I src -o build/main
```

这里我们分别定义了 `lib1.o`, `lib2.o` 作为新的目标，然后让 `main` 依赖于这些目标。

这样做的好处有两个：一是让构建逻辑更加清晰；二是显示指出了 `lib1.o`, `lib2.o` 之间没有依赖关系，可以并行构建。如果你使用命令 `make -j4`，那么 make 就会试图使用 4 个进程并行工作，此时可以看见这两个目标的构建同时进行。

#### 环境变量定义

Makefile 中能够定义变量，变量的定义十分直接：

```makefile
VAR1 = var1 # recursive evaluated
# or
VAR2 := var2 # immediate evaluated
```

其中，`=` 的做法会自动解析变量之间的递归定义，在最终**使用**变量时才求值。而 `:=` 则是立刻求值，如果有个依赖的变量尚未定义，那么直接将其值视为空。因为 `:=` 更符合我们的编程直觉，在复杂逻辑请使用 `:=`。

使用 `$(VAR)` 调用变量，变量值会直接展开，类似于 C/C++ 的宏：

```makefile
CXX = g++
CXX_FLAGS = -std=c++20 -O2 -I $(SRC_DIR)

BUILD_DIR = build
SRC_DIR = src

LIB1 = $(BUILD_DIR)/lib1.o
LIB2 = $(BUILD_DIR)/lib2.o
MAIN = $(BUILD_DIR)/main

$(LIB1): $(SRC_DIR)/lib1.cpp $(SRC_DIR)/lib1.h
	$(CXX) $(CXX_FLAGS) $(SRC_DIR)/lib1.cpp -c -o $(LIB1)

$(LIB2): $(SRC_DIR)/lib2.cpp $(SRC_DIR)/lib2.h
	$(CXX) $(CXX_FLAGS) $(SRC_DIR)/lib1.cpp -c -o $(LIB2)

$(MAIN): $(LIB1) $(LIB2) $(SRC_DIR)/main.cpp
	$(CXX) $(CXX_FLAGS) $(LIB1) $(LIB2) $(SRC_DIR)/main.cpp -o $(MAIN)
```

可见，变量的使用可以让 Makefile 的可配置性和灵活性更高。

在构建目标时，Makefile 预定义了下面的特殊变量：

- `$@`：目标名；
- `$<`：目标的第一个依赖名；
- `$^`：目标的所有依赖列表，去重；
- `$+`：目标的所有依赖列表，不去重；
- `$?`：目标的所有新更新（修改时间戳晚于目标的修改时间戳的依赖）的依赖列表；
- `$*`：在使用 pattern 的时候的匹配项。

于是上面的 Makefile 可以简化成：

```makefile
CXX = g++
CXX_FLAGS = -std=c++20 -O2 -I $(SRC_DIR)

BUILD_DIR = build
SRC_DIR = src

LIB1 = $(BUILD_DIR)/lib1.o
LIB2 = $(BUILD_DIR)/lib2.o
MAIN = $(BUILD_DIR)/main

$(LIB1): $(SRC_DIR)/lib1.cpp $(SRC_DIR)/lib1.h
	$(CXX) $(CXX_FLAGS) $< -c -o $@

$(LIB2): $(SRC_DIR)/lib2.cpp $(SRC_DIR)/lib2.h
	$(CXX) $(CXX_FLAGS) $< -c -o $@

$(MAIN): $(LIB1) $(LIB2) $(SRC_DIR)/main.cpp
	$(CXX) $(CXX_FLAGS) $^ -o $@
```

#### 模式匹配

Makefile 中的模式（pattern）指的是一个包含 `%` 的字符串。其中 `%` 是可匹配任意非空字符串的通配符。下面是两种用法：

```makefile
# 将所有 .cpp 文件编译成 .o 文件
build/%.o: src/%.cpp
	echo Compiling src/$*.cpp # 在命令里面要用 $*
	$(CXX) $(CXX_FLAGS) -c -o $@

# 将列表 SRC_LIST 中所有 .cpp 文件编译成 .o 文件
$(SRC_LIST): build/%.o: src/%.cpp
	$(CXX) $(CXX_FLAGS) -c -o $@
```

#### 函数调用

make 内置了实现一些功能的函数，通过 `$(func <arg1>,<arg2>,...)` 的语法调用。这些函数的表现也和宏一样。

- `$(wildcard <pattern-list>)`：返回所有匹配 `<pattern-list>` 中任意一个模式的文件名列表，这里的模式是 Bash 风格的使用 `*` 的模式；

- `$(patsubst <pattern>,<replacement>,<text>)`：返回 `<text>` 中将 `<pattern>` 替换为 `<replacement>` 的结果，这里的模式是 make 风格的使用 `%` 的模式；
- `$(foreach <var>,<var-list>,<text>)`：返回将 `<var>` 在 `<var-list>` 遍历一遍，并计算 `<text>`，最后以空格分隔所有结果得到的列表；
- `$(shell <command>)`：返回命令 `<command>` 的输出；
- `$(eval <code>)`：将 `<code>` 的内容作为 Makefile 内容执行；
- `$(call <func-name>,<arg1>,<arg2>,...)`：调用自定义函数 `<func-name>`。

自定义函数实际上也是类似宏的东西，按照如下语法定义：

```makefile
define FUNC_NAME
	# 函数体。define 语句和 endef 语句之间内容就是替换内容，包括缩进也会进行替换。
	# $(1) 表示第一个参数，$(2) 表示第二个参数……依次类推。
endef
```

#### 伪目标

伪目标是一类不需要文件存在于磁盘上的目标。比如我试图定义一个 `clean` 目标来清理文件：

```makefile
clean:
	rm build/*
```

如果目录下存在一个名字为 `clean` 的文件，那么 `make clean` 就不会做任何事。

make 提供了一种特殊语法。我们将这些不需要实际文件的目标定义成一个特殊目标 `.PHONY` 的依赖：

```makefile
.PHONY: clean
clean:
	rm build/*
```

`.PHONY` 的依赖都被视作伪目标，此时 make 不会检查 `clean` 文件是否存在，而是一定会构建它。

### Makefile 的工作流

Makefile 的工作过程大致分为两步：

1. 将所有的宏展开。这个过程中会执行各种函数，也可能调用 shell 命令；
2. 得到干净的目标和依赖信息，建立依赖图并进行检查和构建。

Makefile 判断目标是否需要构建的方式是：文件系统会储存文件最后一次修改的时间戳。如果某个目标的依赖的时间戳比自身的时间戳要晚，那么这个目标就需要构建。如果这个目标本身文件就不存在，也需要构建。

## 使用 Makefile 造题

### 前置要求

我们假设你在 Linux 下工作，或者在 Windows 下使用 WSL，或者使用 Unix 风格的 shell（比如 mingw, msys 或者更加重量级的 cygwin）并带有 GNU make 工具。

:::info[Windows 环境]
对于 OIer 而言，我们一般下载下来的 mingw 压缩包（比如从 [winlibs](https://winlibs.com/) 下载）里面有一个 `mingw32-make.exe`。添加环境变量后，你可以直接用 `mingw32-make.exe` 代替后文中的 `make`。同时由于没有完整的类 Unix shell 环境，你只能使用命令提示符 `cmd.exe` 中的命令，请自行判定其和 Linux 命令的区别。

:::

### 如何造题

造题，粗略地分为以下几个步骤：

1. 写题面，写题解；
2. 写标程；
3. 写 Generator；
4. 写 Validator；
5. 跑出数据。

好的，接下来我们从构建的角度来看待这个流程。假设我们的工作目录是这样的一个结构：

```plain
new-problem/
├── build/
├── src/
│   ├── gen.cpp
│   ├── solution.md
│   ├── statement.md
│   ├── std.cpp
│   └── val.cpp
└── Makefile
```

`src/` 内的东西就是我们自己写出来的东西，而 `build/` 目录下就是让 make 生成的东西了。枚举一下 `build/` 里面需要有什么，大概分解一下任务：

1. 题面和题解：这里我们就直接选择将 `src/` 下的 Markdown 源代码复制过去，真实情况下可能是编译 LaTeX 或者其它工作；
2. Standard、Generator、Validator 的源代码：可以直接复制过去；
3. Standard、Generator、Validator 的可执行程序：我们要用这些可执行文件来生成数据；
4. 各个子任务/测试点的数据：依赖于上面的三个可执行程序生成。

构造一个好看的目录结构，大概长这样：

```plain
new-problem/build/
├── data/
│   ├── subtask-1/
│   │   ├── 1.ans
│   │   ├── 1.in
│   │   ├── 2.ans
│   │   ├── 2.in
│   │   └── ...
│   ├── subtask-2/
│   │   ├── 1.ans
│   │   ├── 1.in
│   │   ├── 2.ans
│   │   ├── 2.in
│   │   └── ...
│   └── .../
├── gen
├── gen.cpp
├── solution.md
├── statement.md
├── std
├── std.cpp
├── val
└── val.cpp
```

那么至此我们就有了清晰的思路了：

1. 将题面、题解文件设置成目标，用 `cp` 命令生成；
2. 将 Standard、Generator、Validator 的源代码设置成目标；
3. 将 Standard、Generator、Validator 的可执行文件设置成目标；
4. 将各个子任务/测试点设置成目标，让目标的依赖为 Standard、Generator、Validator 的可执行文件。

接下来深入讲解如何优雅地实现这个思路。

### 编写 Makefile

#### 变量定义

常规地，我们需要先定义一些变量，这样更加方便灵活：

```makefile
CXX = g++
CXX_OPTIONS = -std=c++20 -O2
SRC_DIR = src
BUILD_DIR = build
DATA_DIR = $(BUILD_DIR)/data
```

接下来，我们再给一些目标的名字定义一些变量：

```makefile
STD = $(BUILD_DIR)/std
GEN = $(BUILD_DIR)/gen
VAL = $(BUILD_DIR)/val
DOCS = $(patsubst %,$(BUILD_DIR)/%,std.cpp gen.cpp val.cpp statement.md solution.md)
TEST_POINTS :=
```

这里面 `DOCS` 包含了所有仅需简单拷贝的文件，我们用了 `patsubst` 来简化操作。此外还有一个变量 `TEST_POINTS` 暂时定义为空，因为我们稍后需要用宏去生成它们。

#### 编写依赖关系和生成规则

对于 `STD`, `GEN`, `VAL`，我们都可以直接编译得到源代码。那么我们可以写出这样的规则：

```makefile
$(GEN) $(STD) $(VAL): $(BUILD_DIR)/%: $(SRC_DIR)/%.cpp
	$(CXX) $(CXX_OPTIONS) $< -o $@
```

用到了模式匹配的语法：对列表 `$(GEN) $(STD) $(VAL)` 中的每一个元素，都通过模式替换找到对应的源代码，最后执行编译命令。

对于 `DOCS` 就更简单了：

```makefile
$(DOCS): $(BUILD_DIR)/%: $(SRC_DIR)/%
	cp $< $@
```

仅仅是一个拷贝操作。

对于测试点，就复杂了。我们显然不希望手动输入一个个测试点，所以我们试图通过脚本去生成这些生成规则。这就需要结合 `foreach` 和 `eval` 实现。首先我们先实现一个自定义函数 `BUILD_SINGLE_POINT`，用于生成单个测试点：

```makefile
# $(1): subtask id
# $(2): test point id in subtask
# $(3): generator args
define BUILD_SINGLE_POINT
TEST_POINTS += $(DATA_DIR)/subtask-$(1)/$(2).in $(DATA_DIR)/subtask-$(1)/$(2).ans

$(DATA_DIR)/subtask-$(1)/$(2).in: $(GEN)
	mkdir -p $$(@D)
	$(GEN) $(3) $(shell echo $(1),$(2) | md5sum | cut -d ' ' -f 1) > $$@
	$(VAL) < $$@

$(DATA_DIR)/subtask-$(1)/$(2).ans: $(DATA_DIR)/subtask-$(1)/$(2).in $(STD)
	$(STD) < $$< > $$@
endef
```

这个看起来有点复杂，我们逐步讲解一下：

- L5 用了一个 `+=` 运算。该运算的作用是将内容以列表形式追加到变量之后。这里就是把 `.in` 文件和 `.ans` 文件添加到 `TEST_POINTS` 中；
- L7 是生成 `.in` 文件的规则。`.in` 仅仅依赖于 `GEN`。
- L8 的目的是创建 `subtask-$(1)` 子文件夹。这里有两处需要解释：
  - `@D` 表示目标所在的目录，也就是 `$@` 取 **D**irectorry 的部分。
  - `$$` 符号的作用是转义。我们不能使用一般的 `$(@D)`，因为这会使得函数内容在调用 `call` 的时候就被完全展开。而调用 `call` 时我们仅仅是在拼接字符串，此时是不存在 `$@`, `$(@D)` 这些变量的。所以我们将 `$` 转义，使其能够完整保留地到传给 `eval`。
- L9 调用 Generator。这里出现了一个奇怪的 `$(shell ...)` 调用。这里是因为 `testlib.h` 的随机数种子是根据命令行参数的哈希值确定的，而同一个子任务大多采用同一套参数。为了避免数据重复，我们要给 Generator 参数塞进随机字符串。我们使用了 Linux 自带的 `md5sum` 命令生成校验值，并用 `cut` 命令截取输出中哈希值的那一段。
- L10 调用 Validator。当 Validator 校验失败时，命令以失败状态退出，这个目标就被标记为构建失败了。
- L12, L13 调用 Standard 生成 `.ans` 文件。

现在我们实现了生成单个测试点，现在整合在一起，写出一个生成子任务的函数：

```makefile
# $(1): subtask id
# $(2): number of test cases
# $(3): gen args
define BUILD_SUBTASK
$(foreach i,$(shell seq 1 $(2)),$(eval $(call BUILD_SINGLE_POINT,$(1),$(i),$(3))))
endef
```

这里嵌套了很多层，但是大体上还比较好理解。`seq` 是一个 Linux 命令，`seq <a> <b>` 会生成一串数列 $a, a+1, \dots, b$，我们通过 `$(shell ...)` 调用它，作为 `i` 枚举的集合。然后使用 `$(eval ...)` 和 `$(call ...)` 嵌套来生成该子任务下所有测试点的生成规则。

最后，我们根据不同子任务的配置，手动调用 `BUILD_SUBTASK`，比如：

```makefile
$(eval $(call BUILD_SUBTASK,1,5,--id=1))
$(eval $(call BUILD_SUBTASK,2,5,--id=2))
$(eval $(call BUILD_SUBTASK,3,10,--id=3 --special-property))
$(eval $(call BUILD_SUBTASK,4,10,--id=4))
$(eval $(call BUILD_SUBTASK,5,15,--id=5))
```

#### 特殊目标设置

现在我们定义了所有目标，但是目前还是无法用 `make` 命令“一键生成”。为了做到这一点，我们加入一些新的目标：

```makefile
all: $(TEST_POINTS) $(DOCS) $(GEN) $(STD) $(VAL)
clean:
	rm -rf $(BUILD_DIR)/*
```

现在，使用 `make all` 就能自动完成构建，使用 `make clean` 就能自动清理所有文件。

如果还想更简洁，可以设置：

```makefile
.DEFAULT_GOAL := all
```

然后只需要 `make` 就可以了。

此外，我们还需要添加设置：

```makefile
.PHONY: all clean
.DELETE_ON_ERROR: $(TEST_POINTS)
```

:::warning[构建失败后的文件清理]
`.PHONY` 之前讲过，表示 `all`, `clean` 都是伪目标。而 `.DELETE_ON_ERROR` 也可以望文生义，当 `$(TEST_POINTS)` 中的目标构建失败时，自动将文件删除。这是很必要的，因为 `.in`, `.ans` 的生成规则中没有失败就删除文件的逻辑。如果在文件写入后的校验阶段失败，那么文件还保留在磁盘上，下次构建的时候 make 就会误判。

:::

#### 完整的 Makefile

将上面的内容整合一下，你就得到了完整的 Makefile：

```makefile
CXX = g++
CXX_OPTIONS = -std=c++20 -O2
SRC_DIR = src
BUILD_DIR = build
DATA_DIR = $(BUILD_DIR)/data

STD = $(BUILD_DIR)/std
GEN = $(BUILD_DIR)/gen
VAL = $(BUILD_DIR)/val
DOCS = $(patsubst %,$(BUILD_DIR)/%,std.cpp gen.cpp val.cpp statement.md solution.md)
TEST_POINTS :=

# $(1): subtask id
# $(2): number of test cases
# $(3): gen args
define BUILD_SINGLE_POINT
TEST_POINTS += $(DATA_DIR)/subtask-$(1)/$(2).in $(DATA_DIR)/subtask-$(1)/$(2).ans

$(DATA_DIR)/subtask-$(1)/$(2).in: $(GEN)
	mkdir -p $$(@D)
	$(GEN) $(3) $(shell echo $(1),$(2) | md5sum | cut -d ' ' -f 1) > $$@
	$(VAL) < $$@

$(DATA_DIR)/subtask-$(1)/$(2).ans: $(DATA_DIR)/subtask-$(1)/$(2).in $(STD)
	$(STD) < $$< > $$@
endef

# $(1): subtask id
# $(2): number of test cases
# $(3): gen args
define BUILD_SUBTASK
$(foreach i,$(shell seq 1 $(2)),$(eval $(call BUILD_SINGLE_POINT,$(1),$(i),$(3))))
endef

.DEFAULT_GOAL := all

$(DOCS): $(BUILD_DIR)/%: $(SRC_DIR)/%
	cp $< $@

$(GEN) $(STD) $(VAL): $(BUILD_DIR)/%: $(SRC_DIR)/%.cpp
	$(CXX) $(CXX_OPTIONS) $< -o $@

$(eval $(call BUILD_SUBTASK,1,5,--id=1))
$(eval $(call BUILD_SUBTASK,2,5,--id=2))
$(eval $(call BUILD_SUBTASK,3,10,--id=3 --special-property))
$(eval $(call BUILD_SUBTASK,4,10,--id=4))
$(eval $(call BUILD_SUBTASK,5,15,--id=5))

all: $(TEST_POINTS) $(DOCS) $(GEN) $(STD) $(VAL)
clean:
	rm -rf $(BUILD_DIR)/*

.PHONY: all clean
.DELETE_ON_ERROR: $(TEST_POINTS)
```

看起来还是有点长？没关系，对于大部分题目，这份 Makefile $95\%$ 的内容不需要改动，只用简单更改一下变量和 Generator 参数即可。而且就算你有一些冷门的定制化需求，你也可以直接将基础 Makefile 扔给 LLM 修改，Makefile 保留了上限很高的灵活性。此后你造题就只用关注那几份 `.cpp` 代码，无论做了什么调整，什么修改，只要 `make -j$(nproc)` 就能快速、方便地一键生成数据，最后只要把 `build/` 打包扔给甲方就万事大吉！

## 后记

使用 Makefile 造题是在某次出题过程中偶然迸发了灵感，进而发现这种做法在 Human-AI 协同造题的时候特别好用。最开始我直接让 AI 编写了一份 Makefile，但是其实现比较丑陋，逻辑揉在一块。后来我自己又深入研究了一下 Makefile 语法，将其反复优化，再加以一个下午的写作，才有了这篇文章。希望本篇文章能够给你带来启发！
