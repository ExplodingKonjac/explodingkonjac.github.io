---
title: 夺取多项式全家桶最优解手把手教程
description: 从 SIMD、Montgomery 乘法和 NTT 优化出发，逐步实现高性能的 C++20 多项式算法库，涵盖求逆、对数、指数、插值与复合逆。
pubDate: 2026-02-02
tags: [algorithms, polynomials, SIMD, Cpp, performance]
draft: false
---

## 前言

哪一个 OIer 不曾有过一个愿望：自己写一份跑得飞快的多项式全家桶板子，比别人快上十几倍，拿着它大杀四方，暴力艹过去各种题目，同时也许跑得比取巧的正解还快呢？

那当然，我作为一名 OIer，也是有这个愿望的。然而高中的 OI 生涯忙碌而功利，终究是没能落实下去。如今也退役许久了，大一都过去一个学期了，也是终于有了时间和精力来还愿，作文以记之。

当然，我毕竟已经是退役选手了，那么这份多项式板子的定位相应地也要发生改变。它不再需要考虑压缩代码的行数（事实上正常人写代码都不会压行），它不再需要考虑在考场能不能写得出来（毕竟之后不是 XCPC 就是网络比赛），它不再需要遵守 NOI 系列赛事的规则（下划线函数用不了是什么意思），它不再需要兼容 C++20 以下的中古 C++（什么？2026 年你还在用 C++14？），总而言之是非常自由了。因此读者也完全没有必要把它当作一种所谓具有“实用性”的板子去看待，把它当作一种高性能计算入门小练习也足够有趣了。

我实现的高性能多项式位于 <https://github.com/ExplodingKonjac/libcp/blob/main/cp/fpoly.hpp>。

:::warning[代码示例]
文章中直接写出的代码未经测试，可能有笔误，仅供理解；经过测试的实现请参见仓库。

:::

好的，那么下面教程开始。

## 记号和约定

为了方便描述，我们定义如下的记号：

- 对于序列或者向量 $a$，我们记 $a[l:r]$ 表示 $a_l, a_{l+1}, \dots, a_{\color{red}{r-1}}$ 组成的序列。
- 对于两个序列 $a, b$，我们记 $a + b$ 表示两个序列的拼接。
- 我们记 $\mathbb{F}_p$，其中 $p$ 为质数，表示 $\mathbb{Z} / p\mathbb{Z}$，即模质数意义下的整数环。
- 对于一个多项式/形式幂级数 $F(x)$，我们记 $F(x) = O(x^n)$ 表示 $F(x)$ 的最低次项至少为 $x^n$。这个记号其实相当规范，这一条只是为了防止有 OIer 不熟悉大小 $O$ 等记号在时空复杂度之外的用法。

我们约定使用的语言是 C++，语言标准是 C++20，编译器为 GCC 15.2。

## 初识 SIMD

### SIMD 是什么

工欲善其事，必先利其器。想要写出高效的多项式，必须要有高效的 FFT/NTT；想要有高效的 FFT/NTT，必须要有高效的底层运算；想要有高效的底层运算，就绕不开 SIMD。

SIMD，是 Single Instruction Multiple Data 的缩写，顾名思义就是用单个 CPU 指令去处理多组数据。SIMD 也有两种近似等价的说法，就是**向量化运算**和**数据级并行**。其中向量化运算很好地展现了 SIMD 的计算形式。

结合一个实例来讲，考虑下面这个简单的向量加法算子：

```cpp
void add(const int* a, const int* b, int n, int* out) {
    for (int i = 0; i < n; i++) {
        out[i] = a[i] + b[i];
    }
}
```

正常而言，编译后这会生成一个普通的反复跳转的指令。这当然是很慢的。但是我们加强一点限制，若保证了指针之间不存在别名，我们可以给指针参数加上 `__restrict__` 限定符，然后给编译选项加上 `-O2 -ftree-vectorize -march=native`：

```cpp
void add(const int *__restrict__ a, const int *__restrict__ b, int n, int *out) {
    for (int i = 0; i < n; i++) {
        out[i] = a[i] + b[i];
    }
}
```

Godbolt 结果如下：https://godbolt.org/z/jEndqacvK。可以看到编译器输出了一些形如 `vpaddd` 的指令，并且貌似下标 `i` 对应的寄存器的增量变成了 $32$。这里的字母 v 就是指 vector，向量。`vpaddd` 是一个向量化指令，它一次可以进行 $8$ 个 $32$ 位整数的加法运算，或者说，进行了一个 $\mathbb{Z}^8$ 上的加法。

好家伙，一次进行 $8$ 个运算，相比于原来的代码，那不说真的快了 $8$ 倍，快个四五倍还是可以的吧。的确如此，而要写出高性能的代码，就必须充分利用 CPU 的向量化能力。

### 指令集

为了最大限度地利用向量化，我们不可能总是依赖编译器的自动向量化优化。因此我们必须了解如何手动进行向量化计算。首先我们需要介绍的概念是指令集。

对于不同长度的向量，不同的向量操作，都会整合成一系列的指令，这一系列的指令就自然地被称为指令集（Instruction Set）。下面是 Intel 的一些指令集：

![img](https://en.algorithmica.org/hpc/simd/img/intel-extensions.webp)

其中，$k \text{b}$ 就表示指令集一次处理长度为 $k\ \text{bit}$ 的向量，也就是 $\frac{k}{32}$ 个 $32\text{-bit}$ 整数。

现在让我们看看洛谷的评测机支持哪些指令集。随便找到一道题打开 IDE，运行这个代码：

```cpp
#include <iostream>
using namespace std;

int main() {
    cout << __builtin_cpu_supports("sse") << endl;
    cout << __builtin_cpu_supports("sse2") << endl;
    cout << __builtin_cpu_supports("avx") << endl;
    cout << __builtin_cpu_supports("avx2") << endl;
    cout << __builtin_cpu_supports("avx512f") << endl;

    return 0;
}
```

输出如下：

![](https://cdn.luogu.com.cn/upload/image_hosting/erfebvof.png)

嗯，看起来洛谷机器的配置的确高级，连 avx512f 这种高级指令集都有。但是本篇文章将选择采用 avx2。因为 avx2 相比 avx512f 更加常见，几乎所有的机器都支持，但是 avx512f 的支持度低很多（甚至笔者自己的 Intel(R) Core(TM) Ultra 7 255H 不支持 avx512f……）。

### 向量化指令

那么我们要如何真正地把向量化写进代码呢？GCC 提供了一个头文件 `<immintrin.h>`，里面包含了所有 avx2 指令集的操作，都封装成了函数。至于里面具体有什么函数、函数是什么功能，我们就需要去查阅万能的文档了：[Intel Intrinsics Guide](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/index.html#avxnewtechs=AVX2)。

下面举几个例子：

- `__m256i`：一个类型，表示一个 $256$ 位的整数向量。
- `_mm256_load_si256`：从**对齐的**内存加载一个 $256$ 位向量。
- `_mm256_store_si256`：将一个 $256$ 位向量写入**对齐的**内存。
- `_mm256_add_epi32`：对于两个 $256$ 位向量，做 $32$ 位整数加法。
- `_mm256_mul_epu32`：对于两个 $256$ 位向量，将第 $0, 2, 4, 6$ 个 $32$ 位整数拿出来做 $64$ 位乘法。
- `_mm256_blend_epi32`：对于两个 $256$ 位向量，将它们视作 $8$ 个 $32$ 位整数后，根据一个 $8$ 位立即数“混合”成一个新的向量。

下面这个代码展示了之前的向量加法算子的手写方式：

```cpp
#include <immintrin.h>
#pragma GCC target("avx2")

void add(const int* __restrict__ a, const int* __restrict__ b, int n, int* __restrict__ out) {
    int i = 0;
    for (; i < n; i += 8) {
        __m256i x = _mm256_loadu_si256((const __m256i*)(a + i));
        __m256i y = _mm256_loadu_si256((const __m256i*)(b + i));
        __m256i s = _mm256_add_epi32(x, y);
        _mm256_storeu_si256((__m256i*)(out + i), s);
    }
    for (; i < n; i++) out[i] = a[i] + b[i];
}
```

这个代码只需要一般的编译选项就可以编译了。并且可以看出生成的汇编比之前编译器自动优化的汇编要[简洁很多](https://godbolt.org/z/Mz1TqPTrz)。这里使用 `storeu`/`loadu` 是因为内存地址是不对齐的。

### 内存对齐

对于 OIer 而言，也许很熟悉 C++ 中对象的 size，但是不一定熟悉对象的 alignment。

猜猜下面的两个结构体的 size 分别是多少？

```cpp
#include <cstdint>

struct Foo1 {
    std::int32_t x;
    std::int8_t y;
};
struct Foo2 {
    std::int8_t x;
    std::int32_t y;
};
```

答案是：`sizeof(Foo1) == 8` 并且 `sizeof(Foo2) == 8`。

C++ 中，每个类型的都有一个对齐要求。若类型 $T$ 具有对齐要求 $A$，那么该类型的对象的地址必须为 $A$ 的倍数。而上面的 `Foo1`, `Foo2` 的大小就是为了满足 `std::int32_t` 的对齐要求 $4$ 而引入的 padding bits 所致。

对于一个 `__m256i` 类型，其对齐要求为 `32`。如果你从一个没有对齐的地址强行 `load`，就会发生令人绝望的 Segmentation Fault。喜欢随意强转指针的小伙伴要小心 alignment 爆炸哦。

在 C++ 中，我们可以使用 `alignas(A)` 来指定对象的对齐要求。比如，定义一个首元素对齐为 $32$ 的数组：

```cpp
alignas(32) int a[1 << 16];
```

对齐的对象往往更利于存取，也更利于编译器优化。

### Latency 和 Throughput

如果你去看了 Intel Intrinsics Guide，你会发现每一个指令下都有一个表格，写了不同 CPU 架构的 Latency 和 Throughput (CPI)。那么这些数值是什么意思呢？

现代 CPU 是不会纯串行地执行指令的，会进行指令的并行，只要一个指令所依赖的操作数全部 get ready，这个指令就可以被执行。在这种情景下，我们就不能用单一的“执行时间”来定义指令的效率了。

Latency 指的是：从指令的操作数准备好，到指令的输出准备好之间，需要经过多少时间。以 CPU 时钟周期（Clockticks）为单位。也就是说，这个指令反映了串行的指令需要多长时间完成。

Throughput (CPI) 指的是：CPU 发送这个指令的速率，以 Clockticks per Instruction 为单位，即每间隔多久就可以发送一条这种指令。也就是说，这个指令反映了 CPU 发送并行指令的能力。

如果对于一个算子，其中的运算有很长的依赖链，那么大部分操作都不得不串行执行，算力瓶颈就会落到 Latency 上。与之相对，如果运算的依赖链很短但是运算量很大，那么就需要发送大量的并行指令，这个时候瓶颈就在 Throughput 上了。

## 高效的模域运算

### Montgomery Multiplication

有了 SIMD 这个强力武器，我们就要开始写一个高效的 NTT 了。而在此之前，我们需要优化我们的模乘。编译器一般会对编译期常量的取模生成一种 Barrett Reduction 的变种，通常称做 Magic Number Reduction。但是这种方法不太适合向量化优化，于是我们引入 Montgomery Multiplication。

下面是数学时间。

:::definition[Montgomery 表示与运算]
假设我们要进行模 $P$ 意义下的运算，其中 $P$ 是奇素数。那么考虑定义令一个和 $P$ 互素的常数 $R$，然后定义 Montgomery 域（简称蒙域）：对于 $x \in \mathbb{F}_p$，我们定义 $x$ 在蒙域 $\mathbb{M}_{p, R}$ 中的值为 $x \cdot R \bmod P$。显然这是一个双射。然后我们再定义蒙域中的运算：

$$
\begin{aligned}
    &+: \mathbb{M}_{p, R} \times \mathbb{M}_{p, R} \to \mathbb{M}_{p, R};\ (x, y) \mapsto (x + y) \bmod P \\
    &-: \mathbb{M}_{p, R} \times \mathbb{M}_{p, R} \to \mathbb{M}_{p, R};\ (x, y) \mapsto (x - y) \bmod P \\
    &\times: \mathbb{M}_{p, R} \times \mathbb{M}_{p, R} \to \mathbb{M}_{p, R};\ (x, y) \mapsto x \cdot y \cdot R^{-1} \bmod P
\end{aligned}
$$

:::

加减法还是通常意义下的运算，但是乘法需要解决乘 $R^{-1}$ 的问题。

下面我们定义一个操作 $\operatorname{REDC}(x)$，其作用就是求出 $x \cdot R^{-1} \bmod P$。因为是在模意义计算，所以我们将 $x$ 替换为 $x' = x + m \cdot P$ 也不会有影响。若能使 $x'$ 是 $R$ 的倍数，那么乘 $R^{-1}$ 就迎刃而解了。

$$
x + m \cdot P \equiv 0 \pmod{R} \implies m \equiv x \cdot \left(-P^{-1}\right) \pmod{R}
$$

而幸运的是，$\left(-P^{-1}\right) \bmod R$，是一个常量我们可以预计算出来，记做 $P_{\text{inv}}$。那么最终得到结果：

$$
r = \frac{x + m \cdot P}{R}
$$

分析一下。假设 $0 \le x \le R \cdot P,\ 0 \le m < R$，那么可得 $r$ 的范围是 $[0, 2P)$。需要最后一次比较判断来得到严格的 $[0, P)$ 范围内的值。

因为这里大量使用了模 $R$、除以 $R$ 的操作，所以可以很自然地想到设置 $R = 2^{32}$，这样模 $R$ 就是在 `uint32_t` 下运算，除以 $R$ 就是简单的算术位移。至于 $\left(-P^{-1}\right) \bmod R$，可以使用牛顿迭代求解（模质数幂次下求方程的解）。

实现了 $\operatorname{REDC}(x)$ 后可以发现，将 $x$ 转入蒙域就是求 $\operatorname{REDC}\left(x \cdot R^2\right)$，将 $x$ 转出蒙域就是求 $\operatorname{REDC}(x \cdot 1)$。

#### Lazy Reduction

我们发现最后一步判断是否超出范围实际上是很烦的，比较通常很耗时间。我们能不能省去这一步呢？那当然是可以的。在几乎所有情景下，都有 $P < 2^{30} = \frac{R}{4}$。也就是说，$2P \cdot 2P = 4P^2 < R \cdot P$，仍然符合 $\operatorname{REDC}$ 对输入的要求。

:::remark[Lazy Reduction]
因此我们可以不做最后一步的严格规约，将所有数字都在 $[0, 2P)$ 而不是 $[0, P)$ 内计算。

:::

### 四则运算的向量化

下面我们将实现一套**向量化**的蒙域加减乘法。为了简化描述，下面我们都用 `m256i` 表示 $256$ 位向量，用 `i32`, `u32`, `i64`, `u64` 表示各种宽度的有符号/无符号整数。

我们假设 $R = 2^{32},\ 0 < P < 2^{30}$，使用 Lazy Reduction。

#### 加法：`m256i add(m256i x, m256i y)`

加法分为两步：首先将 $x, y$ 相加，然后如果 $x + y \ge 2P$，我们就需要将结果减去 $2P$。

第一步很简单，之前的例子已经演示过了：

```cpp
m256i s = _mm256_add_epi32(x, y);
```

我们要如何判断 $s$ 中的数是否 $\ge 2P$ 呢？难道写 $8$ 个分支语句吗？那肯定不是。做 SIMD 计算的时候一个重要的思想就是无分支编程（Branchless Programming），使用 mask 之类的办法避免分支。

这里我们使用一个小技巧：我们将 $s$ 减去 $2 P$：

```cpp
m256i d = _mm256_sub_epi32(s, _mm256_set1_epi32(2 * P));
```

这个时候，如果 $s < 2P$，那么 $-2P \le d < 0$，反之 $0 \le d < 2P$。然后我们**在无符号意义下**将 $s, d$ 取一个最小值，就是答案了：

```cpp
return _mm256_min_epu32(s, d);
```

在无符号整数意义下，若 $d < 0$，那么它实际上储存的补码是 $d + 2^{32}$，而我们的 $P < 2^{30}$，因此 $d + 2^{32} > -2^{31} + 2^{32} = 2^{31}$，所以进行一次取 min 操作之后就可以完美提取出在 $[0, 2P)$ 范围内的那些数了。

#### 减法：`m256i sub(m256i x, m256i y)`

同理，我们先直接将 $x, y$ 相减，然后再加上 $2P$。

```cpp
m256i d = _mm256_sub_epi32(x, y);
m256i s = _mm256_add_epi32(d, _mm256_set1_epi32(2 * P));
```

然后我们再取 min：

```cpp
return _mm256_min_epu32(s, d);
```

依旧是利用负数补码的性质。

#### 约减：`m256i redc(m256i x)`

在写乘法之前，我们先实现向量化版本的 $\operatorname{REDC}(x)$。由于我们要做 $64$ 位乘法，这里 `x` 只有第 $0, 2, 4, 6$ 个 $32$ 位整数是有用的。

假设我们已经求出了 $P_{\text{inv}} = \left(-P^{-1}\right) \bmod R$，那么我们就可以依葫芦画瓢，直接把约减的过程搬过来：

```cpp
m256i m = _mm256_mul_epu32(x, _mm256_set1_epi32(P_INV));
m256i v = _mm256_mul_epu32(m, _mm256_set1_epi32(P));
return _mm256_add_epi64(x, v);
```

注意这里其实没有进行最后一步除以 $R$ 的操作，所以实际上结果被放在了第 $1, 3, 5, 7$ 个整数上。

#### 乘法：`m256i mul(m256i x, m256i y)`

因为 $64$ 位乘法只能对偶数位上的数操作，我们需要把分离奇数位和偶数位。我们可以使用 shuffle 操作达到这个目的：

```cpp
m256i x1 = _mm256_shuffle_epi32(x, 0xF5);
m256i y1 = _mm256_shuffle_epi32(x, 0xF5);
```

函数 `_mm256_shuffle_epi32` 会把一个 $256\text{-bit}$ 向量分成左右两个 $128\text{-bit}$ 的 lane，要求传入的 $8\text{-bit}$ 立即数 `imm` 也会被分成 $4$ 份：$\mathrm{imm} = \left(\overline{p_3 p_2 p_1 p_0}\right)_2$。然后对于高低两个 lane 都进行下面的操作：

$$
\operatorname{Shuffle}([x_0, x_1, x_2, x_3], \mathrm{imm}) = [x_{p_0}, x_{p_1}, x_{p_2}, x_{p_3}]
$$

而在我们这里，有 $(\mathrm{F5})_{16} = (11|11|01|01)_2$。也就是把 $1, 3$ 位的数挪到了 $0, 2$ 位。

接下来就可以对奇偶部分都进行乘法和约减：

```cpp
m256i res0 = redc(_mm256_mul_epu32(x, y));
m256i res1 = redc(_mm256_mul_epu32(x1, y1));
```

我们现在要将两个结果重新混合。因为 `redc()` 把结果放在了 $1, 3, 5, 7$ 位，我们先把 `res0` 进行一个归位：

```cpp
res0 = _mm256_shuffle_epi32(res0, 0xF5);
```

然后要做的就是逐位的混合了。这里需要使用 `_mm256_blend_epi32`。它会接受两个 $256\text{-bit}$ 向量和一个 $8\text{-bit}$ 控制参数 $\mathrm{control}$。逻辑很简单：若 $\mathrm{control}$ 的第 $k$ 位是 $0$，那么返回值的第 $k$ 个数就是第一个向量的第 $k$ 个数，否则就是第二个向量的第 $k$ 个数。

```cpp
return _mm256_blend_epi32(res0, res1, 0xAA)
```

这里 $(\mathrm{AA})_{16} = (10101010)_2$。

#### 取反：`m256i neg(m256i x)`

取反也是一个常见的操作。因为我们在 $[0, 2P)$ 内考虑，所以最简单的取反肯定是直接计算 $2P - x$。但是对于边界情况 $x = 0$，取反后的结果就是 $0$，如果用 $2P - x$ 的话就超过范围了。现在我们要把这些计算向量化。

首先算出来 $2P - x$ 的结果：

```cpp
m256i r = _mm256_sub_epi32(_mm256_set1_epi32(2 * P) - x);
```

此外，我们还需要将 $x$ 和 $0$ 进行比较：

```cpp
m256i eq = _mm256_cmpeq_epi32(x, _mm256_setzero_si256());
```

`_mm256_cmpeq_epi32` 的逻辑很简单，对于两个 $256\text{-bit}$ 向量逐位比较是否相等。但是返回值形式比较特殊。如果第 $k$ 对 $32\text{-bit}$ 整数相等，那么返回值的第 $k$ 个 $32\text{-bit}$ 整数就是全 $1$，即 $(\mathrm{FFFF})_{16}$，否则就是全 $0$。

那么我们发现，我们把 `eq` 取反一下，再和 `r` 进行一个按位与，不就把所有 $x = 0$ 的位置给清零了吗？恰好有一个函数就是干这件事情的，于是直接写：

```cpp
return _mm256_andnot_si256(eq, y);
```

## 高效的 NTT

我们假设读者已经会了最基础的 NTT。下面我们一步步对 NTT 进行优化。

为了方便写代码逻辑，我们假设有类型 `Mint` 封装了模域下的运算。这个类是 <https://github.com/ExplodingKonjac/libcp/blob/main/cp/modint.hpp> 中定义的 `cp::SModint` 的别名。

### 去除位逆序置换

但凡写过 NTT 都应该对最开始的这个位逆序变换印象深刻。说实话，虽然位逆序变换仅仅是 $O(n)$ 的复杂度，但是它实际上占用了整个 NTT 中相当高的时间比例。因为它的内存访问模式过于逆天了，缓存友好性可能还不如随机访问。所以我们必须尝试去除位逆序变换。

知识面比较广的选手可能听说过**转置 NTT**，这是通过转置原理来消除位逆序置换的一种方法。它使得正变换输入为自然序，输出为位逆序；而逆变换输入为位逆序，输出为自然序，因此中间的位逆序置换就可以省略了。最终的正变换和逆变换在形式上与信号学上的按频域抽取（DIF）和按时域抽取（DIT）等价，因此常常把函数名写成 `DIF`/`DIT`。

这里我们依然要做到正变换输入自然序，输出位逆序；逆变换输入位逆序，输出自然序，但是不使用转置原理的思路。

先回顾一下朴素的 NTT 流程：

1. 做位逆序置换；
2. 从小到大枚举一个步长 $i \in \{1, 2, 4, \dots, N/2\}$；
3. 枚举一个下标 $k$；
4. 对于每对长为 $i$ 的相邻块，对它们的第 $k$ 个数进行一次蝴蝶变换（$\begin{bmatrix} 1 & \omega \\ 1 & -\omega \end{bmatrix}$）。

我们可以把 2, 3, 4 步描述得更清晰一些：

2. 从小到大枚举一个 $i \in \{0, 1, \dots, \log_2 N - 1\}$；
3. 对于每对第 $i$ 个二进制为不同的数进行蝴蝶变换（即对于 $x = (\text{high}\, 0\, \text{low})_2,\ y = (\text{high}\, 1\, \text{low})_2$ 进行变换：$[a_x', a_y']^\top = \begin{bmatrix} 1 & \omega \\ 1 & -\omega \end{bmatrix} [a_x, a_y]^\top$）。

现在我们想要省略第一步位逆序置换，不妨改变一下看待下标的视角。我们不对序列本身做位逆序变换，而是将下标反转来看，这样的话，我们的流程就变成了：

1. 从大到小枚举一个 $i \in \{\log_2 N - 1, \dots, 2, 1\}$；
2. 对于每对第 $i$ 个二进制为不同的数进行蝴蝶变换。

这样得到的结果是逆序视角下的自然序，也就是正常视角下的位逆序。代码如下：

```cpp
void DIF(Mint* a, size_t len) {
    for (size_t i = len; i >= 2; i >>= 1) {
        size_t s = i >> 1;
        for (size_t j = 0; j < len; j += i) {
            Mint wj = w[i][bit_rev(std::countr_zero(i), j / i)];
            for (int k = 0; k < s; j++) {
                Mint x = a[j + k], y = a[j + k + i];
                a[j + k] = x + wj * y;
                a[j + k + i] = x - wj * y;
            }
        }
    }
}
```

其中 `w[i][j]` 表示 $\omega_i^j$。对于逆变换，我们直接把循环方向反向，并对正变换的矩阵取逆：

$$
\begin{bmatrix}
    1 & \omega \\
    1 & -\omega
\end{bmatrix}^{-1} = \begin{bmatrix}
    \frac{1}{2} & -\frac{1}{2} \\
    \frac{1}{2 \omega} & -\frac{1}{2 \omega}
\end{bmatrix}
$$

```cpp
void DIT(Mint* a, size_t len) {
    for (size_t i = 2; i <= len; i <<= 1) {
        size_t s = i >> 1;
        for (size_t j = 0; j < len; j += i) {
            Mint wj = iw[i][bit_rev(std::countr_zero(i), j / i)];
            for (int k = 0; k < s; j++) {
                Mint x = a[j + k], y = a[j + k + i];
                a[j + k] = x + y;
                a[j + k + i] = wj * (x - y);
            }
        }
    }
    Mint ilen = Mint{len}.inv();
    for (size_t i = 0; i < len; i++) a[i] *= ilen;
}
```

其中 `iw[i][j]` 表示 $\omega_i^{-j}$。

这种方法首先带来的好处就是，我们的内存访问更加缓存友好了。传统的预处理原根写法中，我们在访问 `a` 数组的时候还要同时访问原根数组，很容易造成 cache miss。现在因为下标和外层循环有关而不是内层循环，我们读取预处理数组的次数显著减少，最底层的变换变成了纯粹的顺序、连续访问。

### 优化预处理

上面的代码仅仅是为了演示，实际上我们当然不会采用一个看起来大小是 $n^2$ 的二维数组。

我们定义 $\operatorname{BitRev}(k, x)$ 表示翻转 $x$ 的第 $0 \sim k-1$ 位二进制的结果。那么我们发现，对于 $k \in \mathbb{Z}^+,\ 0 \le x < 2^k$，我们有：

$$
\omega_{2^{k + 1}}^{\operatorname{BitRev}(k + 1, x)} = \omega_{2^{k + 1}}^{2 \operatorname{BitRev}(k, x)} = \omega_{2^k}^{\operatorname{BitRev}(k, x)}
$$

这就有点意思了。假设我们预处理一个数组 `w[k][x]` 来表示 $\omega_{2^k}^x$，那么 `w[k]` 一定是 `w[k+1]` 的前缀。因此我们实际上只需要一个数组就能保存所有我们需要的信息。

这个数组的递推方式也十分简单，只需要考虑下标的最高位从 $0$ 变成 $1$ 的增量，对应到反转后就是指数的最低位从 $0$ 变成 $1$：

```cpp
void init() {
    w[1] = iw[1] = 1;
    for (int k = 0; k < LG_MAXN; k++) {
        Mint wn = qpow(G, (P - 1) >> (k + 1)), iwn = wn.inv();
        for (int i = 0; i < (1 << k); i++) {
            w[i + (1 << k)] = w[i] * wn;
            iw[i + (1 << k)] = iw[i] * iwn;
        }
    }
}
```

那么更进一步，这个预处理数组的大小还可以进一步压缩。我们观察一下上面的初始化过程，就可以直接写出来 $w_i$ 的表达式：

$$
w_i = \prod_{i = 0}^m G^{\frac{P - 1}{2^{b_i + 1}}} \quad \left(i = 2^{b_1} + 2^{b_2} + \cdots 2^{b_m},\ b_1 < b_2 < \cdots < b_m\right)
$$

也就是说 $w_i$ 实际上可以按位拆成一些独立的项的乘积。于是可以发现，$\frac{w_{i+1}}{w_i}$ 只和 $i$ 的后导 $1$ 的数量有关。因此我们可以只预处理大小为 $O(\log n)$ 的数组 `wd[j]`，储存 $\frac{w_{2^j}}{w_{2^j - 1}}$ 的值，在 DIF 的循环中动态更新就行了。因为旋转因子的更新发生在第二层循环而不是最内层循环，增加的乘法操作不会形成瓶颈，同时我们还把预处理的时空复杂度降低到了 $O(\log n)$。此时预处理的复杂度足够低，借助 C++ 的一些简单的 constexpr 特性，所有运算都可以在编译期完成了。

```cpp
constexpr struct _DFTInfo {
    Mint rt[LG_MAXN + 1], irt[LG_MAXN + 1];
    Mint wd[LG_MAXN - 2], iwd[LG_MAXN - 2];

    constexpr _DFTInfo() {
        Mint prd = qpow(G, (P - 1) >> LG_MAXN), iprd = prd.inv();
        for (size_t i = LG_MAXN; ~i; i--) {
            rt[i] = prd, irt[i] = iprd;
            prd *= prd, iprd *= iprd;
        }
        prd = iprd = 1;
        for (size_t i = 0; i + 2 <= LG_MAXN; i++) {
            w4d[i] = rt[i + 2] * prd, prd *= irt[i + 2];
            iw4d[i] = irt[i + 2] * iprd, iprd *= rt[i + 2];
        }
    }
} dft_info{};
```

### Radix-4 DFT

到此为止，我们的 DFT 仍旧使用的是 radix-2，即分治的分支数为 $2$。使用 radix-2 时，我们相当于要将整个数组进行 $\log_2 n$ 次顺序存取，两层之间几乎一定会出现 cache miss。同时，因为变换矩阵十分简单，CPU 的算力根本吃不满，寄存器大部分空置，这就导致内存读写成为了瓶颈。为了优化，我们可以考虑使用 radix-4 的 DFT，即分治的分支数为 $4$。这样我们的变换层数就会下降到 $\log_4 n$，成为了原来的 $\frac{1}{2}$，cache miss 降低了，同时在层内的变换也可以更好地吃满算力和寄存器。

下面我们稍微推导一下 Radix-4 的 DFT：

$$
\begin{aligned}
    \operatorname{DFT}(a)_k & = \sum_{j = 0}^{n - 1} a_j \omega_{n}^{k j} \\
    & = \sum_{r = 0}^3 \sum_{j = 0}^{\frac{n}{4} - 1} a_{4 j + r} \omega_n^{k (4j  + r)} \\
    & = \sum_{r = 0}^3 \omega_n^{k r} \sum_{j = 0}^{\frac{n}{4} - 1} a_{4j + r} \omega_{\frac{n}{4}}^{k j}
\end{aligned}
$$

我们记数列 $A^{(k)} = [a_k, a_{4 + k}, a_{8 + k}, \dots, a_{4(\frac{n}{4} - 1) + k}]$，那么：

$$
\operatorname{DFT}(a)_k = \sum_{r = 0}^3 \omega_n^{k r} \operatorname{DFT}\left(A^{(r)}\right)_{k \bmod \frac{n}{4}}
$$

分段考虑，若 $k = t \cdot \frac{n}{4} + m$：

$$
\operatorname{DFT}(a)_k = \sum_{r = 0}^3 \omega_4^{t r} \omega_n^{m r} \operatorname{DFT}\left(A^{(r)}\right)_m
$$

也就是说：

$$
\begin{bmatrix}
    \operatorname{DFT}(a)_{m} \\
    \operatorname{DFT}(a)_{\frac{n}{4} + m} \\
    \operatorname{DFT}(a)_{\frac{n}{2} + m} \\
    \operatorname{DFT}(a)_{\frac{3n}{4} + m} \\
\end{bmatrix} = \begin{bmatrix}
    1 & 1 & 1 & 1 \\
    1 & \mathrm{i} & -1 & -\mathrm{i} \\
    1 & -1 & 1 & -1 \\
    1 & -\mathrm{i} & 1 & \mathrm{i}
\end{bmatrix} \begin{bmatrix}
    1 & ~ & ~ & ~ \\
    ~ & \omega_n^m & ~ & ~ \\
    ~ & ~ & \omega_n^{2m} & ~ \\
    ~ & ~ & ~ & \omega_n^{3m} \\
\end{bmatrix} \begin{bmatrix}
	\operatorname{DFT}\left(A^{(0)}\right)_m \\
	\operatorname{DFT}\left(A^{(1)}\right)_m \\
	\operatorname{DFT}\left(A^{(2)}\right)_m \\
	\operatorname{DFT}\left(A^{(3)}\right)_m \\
\end{bmatrix}
$$

左边的矩阵是一个 $4$ 阶蝴蝶变换矩阵，右边的矩阵是旋转因子矩阵。

当然，radix-4 DFT 也可以使用位逆序置换来让变换形式变得简洁。但是现在情形和 radix-2 不太一样了。不妨想想位逆序置换是怎么出现的：我们希望把偶数下标放到左边，奇数下标放到右边，这在下标上的变换就体现为把最低的二进制位移动到最高位。而现在我们希望把下标模 $4$ 余 $0, 1, 2, 3$ 的子序列 $A^{(0)}, A^{(1)}, A^{(2)}, A^{(3)}$ 依次排列成：

$$
\left[A^{(0)} \mid A^{(1)} \mid A^{(2)} \mid A^{(3)}\right]
$$

这在下标上的变换体现为把最低的两位移动到最高处。但是，我们做的是位逆序变换，所以这两位之间的顺序也被改变了，因此实际上我们面对的序列是这样：

$$
\left[A^{(0)} \mid A^{(2)} \mid A^{(1)} \mid A^{(3)}\right]
$$

但是变换矩阵仍然不变。只需要注意一下下标的顺序就行了。

现在，再结合一下之前讲到的位逆序视角 DFT，我们要将手中的序列下标逆过来看。除了循环的方向变了之外，我们还要仔细考虑每层的每一个子变换。我们知道，**假设**我们做了位逆序置换，序列应该形如 $ \left[\operatorname{DFT}\left(A^{(0)}\right) \mid \operatorname{DFT}\left(A^{(2)}\right) \mid \operatorname{DFT}\left(A^{(1)}\right) \mid \operatorname{DFT}\left(A^{(3)}\right)\right]$，但**实际上**的序列没有做位逆序置换，我们只是用位逆序的视角去看而已。因此**实际上**的排列还是 $ \left[\operatorname{DFT}\left(A^{(0)}\right) \mid \operatorname{DFT}\left(A^{(1)}\right) \mid \operatorname{DFT}\left(A^{(2)}\right) \mid \operatorname{DFT}\left(A^{(3)}\right)\right]$。然后我们进行变换：

$$
\begin{bmatrix}
    B^{(0)} \\
    B^{(1)} \\
    B^{(2)} \\
    B^{(3)}
\end{bmatrix} = \begin{bmatrix}
    1 & 1 & 1 & 1 \\
    1 & \mathrm{i} & -1 & -\mathrm{i} \\
    1 & -1 & 1 & -1 \\
    1 & -\mathrm{i} & 1 & \mathrm{i}
\end{bmatrix} \begin{bmatrix}
    1 & ~ & ~ & ~ \\
    ~ & \omega_n^m & ~ & ~ \\
    ~ & ~ & \omega_n^{2m} & ~ \\
    ~ & ~ & ~ & \omega_n^{3m} \\
\end{bmatrix} \begin{bmatrix}
	\operatorname{DFT}\left(A^{(0)}\right)_m \\
	\operatorname{DFT}\left(A^{(1)}\right)_m \\
	\operatorname{DFT}\left(A^{(2)}\right)_m \\
	\operatorname{DFT}\left(A^{(3)}\right)_m \\
\end{bmatrix}
$$

同理，**假设**我们做了位逆序置换，输出序列的排列应该形如 $\left[B^{(0)} \mid B^{(1)} \mid B^{(2)} \mid B^{(3)} \right]$。因此，在位逆序的视角下，输出序列的排列应该是 $\left[B^{(0)} \mid B^{(2)} \mid B^{(1)} \mid B^{(3)} \right]$。

于是我们就可以写出 radix-4 的代码：

```cpp
constexpr Mint I = qpow(G, (P - 1) / 4), I_INV = -I;

constexpr struct _DFTInfo {
    Mint rt[LG_MAXN + 1], irt[LG_MAXN + 1];
    Mint w4d[LG_MAXN - 2], iw4d[LG_MAXN - 2];

    constexpr _DFTInfo() {
        Mint prd = qpow(G, (P - 1) >> LG_MAXN), iprd = prd.inv();
        for (size_t i = LG_MAXN; ~i; i--) {
            rt[i] = prd, irt[i] = iprd;
            prd *= prd, iprd *= iprd;
        }
        // 注意预处理是需要做出更改的！读者不妨稍微自行推导一下。
        prd = iprd = 1;
        for (size_t i = 0; i + 3 <= LG_MAXN; i++) {
            w4d[i] = rt[i + 3] * prd, prd *= irt[i + 3];
            iw4d[i] = irt[i + 3] * iprd, iprd *= rt[i + 3];
        }
    }
} dft_info{};

void DIF(Mint* a, size_t len) {
    size_t i = len;
    // 这种情况，我们手动做一层 radix-2。注意在位逆序视角下，旋转因子都是 0 次。
    if ((std::countr_zero(len) & 1) == 1) {
        i >>= 1;
        for (size_t k = 0; k < i; k++) {
            Mint x = a[k], y = a[i + k];
            a[k] = x + y, a[i + k] = x - y;
        }
    }
    for (size_t s = i >> 2; i >= 4; i >>= 2, s >>= 2) {
        Mint w1{1}, w2{1}, w3{1};
        for (size_t j = 0, jc = 0; j < len; j += i, jc++) {
            auto pA = a + j, pB = pA + s, pC = pB + s, pD = pC + s;
            for (size_t k = 0; k < s; k++) {
                // 顺序加载
                auto A = pA[k];
                auto B = pB[k] * w1;
                auto C = pC[k] * w2;
                auto D = pD[k] * w3;
                auto t0 = A + C, t1 = A - C, t2 = B + D, t3 = I * (B - D);
                // 逆序写入
                pA[k] = t0 + t2;
                pB[k] = t0 - t2;
                pC[k] = t1 + t3;
                pD[k] = t1 - t3;
            }
            w1 *= dft_info.w4d[std::countr_one(jc)];
            w2 = w1 * w1;
            w3 = w2 * w1;
        }
    }
}

void DIT(Mint* a, size_t len) {
    // 对着 DIF 的矩阵求逆，可以直接得到 DIT。
    size_t i = 4;
    for (size_t s = i >> 2; i <= len; i <<= 2, s <<= 2) {
        Mint w1{1}, w2{1}, w3{1};
        for (size_t j = 0, jc = 0; j < len; j += i, jc++) {
            auto pA = a + j, pB = pA + s, pC = pB + s, pD = pC + s;
            for (size_t k = 0; k < s; k++) {
                // 逆运算，逆序加载
                auto A = pA[k];
                auto B = pB[k];
                auto C = pC[k];
                auto D = pD[k];
                auto t0 = A + B, t1 = A - B, t2 = C + D, t3 = I_INV * (C - D);
                // 顺序写入
                pA[k] = t0 + t2;
                pB[k] = (t1 + t3) * w1;
                pC[k] = (t0 - t2) * w2;
                pD[k] = (t1 - t3) * w3;
            }
            w1 *= dft_info.w4d[std::countr_one(jc)];
            w2 = w1 * w1;
            w3 = w2 * w1;
        }
    }
    if (i != len) {
        i >>= 2;
        for (size_t k = 0; k < i; k++) {
            Mint x = a[k], y = a[i + k];
            a[k] = x + y, a[i + k] = x - y;
        }
    }
    Mint ilen = Mint{len}.inv();
    for (size_t j = 0; j < len; j++) a[j] *= ilen;
}
```

### 向量化！

之前铺垫许久的 SIMD 到现在还未曾使用呢。那么接下来我们就把 DFT 的运算向量化，真正做到释放性能。为了方便描述，我们先定义下面的函数：

```cpp
m256i vload(const void* p) {
    return _mm256_load_si256((const m256i*)p);
}
m256i vloadu(const void* p) {
    return _mm256_loadu_si256((const m256i*)p);
}
void vstore(void* p, m256i a) {
    _mm256_store_si256((m256i*)p, a);
}
void vstoreu(void* p, m256i a) {
    _mm256_storeu_si256((m256i*)p, a);
}
// 这里不直接使用 _mm256_set1_epi32 等函数是为了支持 constexpr
constexpr m256i vset1(u32 x) {
    return (m256i)__v8su{x, x, x, x, x, x, x, x};
}
constexpr m256i vsetr(u32 v0, u32 v1, u32 v2, u32 v3,
                      u32 v4, u32 v5, u32 v6, u32 v7) {
    return (m256i)__v8su{v0, v1, v2, v3, v4, v5, v6, v7};
}
constexpr m256i vset1(Mint x) {
    return vset1(x.raw());
}
constexpr m256i vsetr(Mint v0, Mint v1, Mint v2, Mint v3,
                      Mint v4, Mint v5, Mint v6, Mint v7) {
    return vsetr(v0.raw(), v1.raw(), v2.raw(), v3.raw(),
                 v4.raw(), v5.raw(), v6.raw(), v7.raw());
}
```

很容易发现，我们 DFT 的大部分操作都是在进行位对位的乘法加法，这就很容易进行向量化了。因为一个 $256\text{-bit}$ 向量包含 $8$ 个 $32$ 位整数，因此我们（暂时）只能向量化处理 $s \ge 8$ 的层。假设输入的指针 `a` 是已经对齐了的，我们就可以直接翻译出代码：

```cpp
constexpr auto V_I = vset1(I), V_I_INV = vset1(I_INV)

void scale(const Mint* a, Mint k, size_t len, Mint* out) {
    size_t i = 0;
    const m256i vk = vset1(k);
    for (; i + 7 < len; i += 8) vstore(out + i, mul(vload(a + i), vk));
    for (; i < len; i++) out[i] = a[i] * k;
}
void DIF(Mint* a, size_t len) {
    // 小长度特殊处理
    if (len == 1) return;
    if (len == 2) {
        Mint x = a[0], y = a[1];
        a[0] = x + y, a[1] = x - y;
    } else if (len == 4) {
        constexpr Mint I = dft_info.rt[2];
        Mint A = a[0], B = a[1], C = a[2], D = a[3];
        Mint t0 = A + C, t1 = A - C, t2 = B + D, t3 = I * (B - D);
        a[0] = t0 + t2, a[1] = t1 + t3;
        a[2] = t0 - t2, a[3] = t1 - t3;
    } else {
        size_t i = len;
        // 为了将最终的块长变成 8，我们在 lg len 为偶数的时候先做一次 radix-2
        if ((std::countr_zero(len) & 1) == 0) {
            i >>= 1;
            for (size_t k = 0; k < i; k += 8) {
                auto x = vload(a + k), y = vload(a + i + k);
                vstore(a + k, add(x, y));
                vstore(a + i + k, sub(x, y));
            }
        }
        for (size_t s = i >> 2; i >= 32; i >>= 2, s >>= 2) {
            Mint _w1{1}, _w2{1}, _w3{1};
            for (size_t j = 0, jc = 0; j < len; j += i, jc++) {
                auto w1 = vset1(_w1), w2 = vset1(_w2), w3 = vset1(_w3);
                auto pA = a + j, pB = pA + s, pC = pB + s, pD = pC + s;
                for (size_t k = 0; k < s; k += 8) {
                    auto A = vload(pA + k);
                    auto B = mul(vload(pB + k), w1);
                    auto C = mul(vload(pC + k), w2);
                    auto D = mul(vload(pD + k), w3);
                    auto t0 = add(A, C), t1 = sub(A, C), t2 = add(B, D), t3 = mul(V_I, sub(B, D));
                    vstore(pA + k, add(t0, t2));
                    vstore(pB + k, sub(t0, t2));
                    vstore(pC + k, add(t1, t3));
                    vstore(pD + k, sub(t1, t3));
                }
                _w1 *= dft_info.w4d[std::countr_one(jc)];
                _w2 = _w1 * _w1;
                _w3 = _w2 * _w1;
            }
        }
        /* 做长度为 8 的 DFT */
    }
}
static void DIT(Mint* a, size_t len) {
    if (len == 1) return;
    if (len == 2) {
        constexpr Mint i2 = Mint{2}.inv();
        Mint x = a[0], y = a[1];
        a[0] = (x + y) * i2, a[1] = (x - y) * i2;
    } else if (len == 4) {
        constexpr Mint i4 = Mint{4}.inv(), I = dft_info.irt[2];
        Mint A = a[0], B = a[1], C = a[2], D = a[3];
        Mint t0 = A + C, t1 = A - C, t2 = B + D, t3 = I * (B - D);
        a[0] = (t0 + t2) * i4, a[1] = (t1 + t3) * i4;
        a[2] = (t0 - t2) * i4, a[3] = (t1 - t3) * i4;
    } else {
        /* 做长度为 8 的 IDFT */
        for (size_t i = 32, s = i >> 2; i <= len; i <<= 2, s <<= 2) {
            Mint _w1{1}, _w2{1}, _w3{1};
            for (size_t j = 0, jc = 0; j < len; j += i, jc++) {
                auto w1 = vset1(_w1), w2 = vset1(_w2), w3 = vset1(_w3);
                auto pA = a + j, pB = pA + s, pC = pB + s, pD = pC + s;
                for (size_t k = 0; k < s; k += 8) {
                    auto A = vload(pA + k);
                    auto B = vload(pB + k);
                    auto C = vload(pC + k);
                    auto D = vload(pD + k);
                    auto t0 = add(A, B), t1 = sub(A, B), t2 = add(C, D), t3 = mul(V_I_INV, sub(C, D));
                    vstore(pA + k, add(t0, t2));
                    vstore(pB + k, mul(add(t1, t3), w1));
                    vstore(pC + k, mul(sub(t0, t2), w2));
                    vstore(pD + k, mul(sub(t1, t3), w3));
                }
                _w1 *= dft_info.iw4d[std::countr_one(jc)];
                _w2 = _w1 * _w1;
                _w3 = _w2 * _w1;
            }
        }
        if ((std::countr_zero(len) & 1) == 0) {
            size_t s = len >> 1;
            for (size_t k = 0; k < s; k += 8) {
                auto x = vload(a + k), y = vload(a + k + s);
                vstore(a + k, add(x, y));
                vstore(a + k + s, sub(x, y));
            }
        }
        scale(a, Mint{len}.inv(), len, a);
    }
}
```

接下来，我们要考虑一下步长 $\le 8$ 的情况应该怎么办了。$8$ 个整数恰好可以放进一个 $256\text{-bit}$ 向量，我们可以尝试直接在寄存器内部用 radix-8 做完最后一层。经过类似的推导，我们能够得到 radix-8 的变换矩阵：

$$
\begin{bmatrix}
a'_{8j + 0} \\ a'_{8j + 1} \\ \vdots \\ a'_{8j + 7}
\end{bmatrix} = \begin{bmatrix}
\omega_8^{i j}
\end{bmatrix}_{8 \times 8} \operatorname{diag}\left(\omega_n^{0j}, \omega_n^{1j}, \dots, \omega_n^{7j}\right) \begin{bmatrix}
a_{8j + 0} \\ a_{8j + 1} \\ \vdots \\ a_{8j + 7}
\end{bmatrix}
$$

第一步是乘旋转因子矩阵，因为这是对角矩阵，所以我们直接做向量的对位乘法。第二步是乘蝴蝶变换矩阵。我们知道所谓蝴蝶变换其实就是 DFT，所以可以再使用 radix-2 的方式把这个矩阵拆解。正巧的是，根据之前的分析，我们需要按照正常序输入向量，并按照位逆序输出向量，这不就是 DIF（这个 DIF 指的是通常意义下的所谓转置 DFT 的正变换，去除末尾位逆序置换。虽然我们实现的函数名也叫 DIF，但它实际上做的是 DIT，只不过看待下标的视角逆转了，因此整体效果和 DIF 一致）做的事情吗？所以我们只需要在向量内部做三层转置 DIF 就行了。

子变换的矩阵如下：

$$
\boldsymbol{D} = \begin{bmatrix}
1 & 1 \\
\omega & -\omega
\end{bmatrix}
$$

我们拿到的向量如下：

$$
\boldsymbol{v} = [a_0, a_1, a_2, a_3, a_4, a_5, a_6, a_7]^\top
$$

接下来进行三层变换。先考虑第一层。我们要对 $[a_0, a_4], [a_1, a_5], \dots$ 乘上矩阵 $\boldsymbol{D}$。我们先使用 `_mm256_permute4x64` 对 $v$ 进行跨 $128\text{-bit}$ lane 的重排，得到向量

$$
\boldsymbol{v}_1 = [a_4, a_5, a_6, a_7, a_0, a_1, a_2, a_3]^\top = \operatorname{Permute_{4 \times 64}}(\boldsymbol{v}, (\mathrm{4E})_{16})
$$

然后我们再将 $\boldsymbol{v}$ 的第 $4 \sim 7$ 个分量取相反数（使用取相反数和 `_mm256_blend_epi32` 组合），得到向量

$$
\boldsymbol{v}_2 = [a_0, a_1, a_2, a_3, -a_4, -a_5, -a_6, -a_7]^\top
$$

那么我们将上面两个向量相加，就得到了

$$
\boldsymbol{v}_3 = [a_0 + a_4, \dots, a_0 - a_4, \dots]^\top
$$

现在进行最后一步，将 $\boldsymbol{v}_3$ 的第 $4 \sim 7$ 个分量乘上旋转因子 $\omega$，得到最终结果，也就是说：

$$
\boldsymbol{v}' = \operatorname{Mul}\left(\boldsymbol{v}, \left[1, 1, 1, 1, \omega_8^0, \omega_8^1, \omega_8^2, \omega_8^3\right]^\top\right)
$$

可以发现第二层和第三层也能采用同样的办法：我们先进行重排，两两交换所有相邻的块（现在的交换都是在 $128\text{-bit}$ lane 内部的交换了，可以使用效率更高的 `_mm256_shuffle_epi32`）得到 $\boldsymbol{v}_1$。然后进行部分位置取相反数，得到 $\boldsymbol{v}_2$。接下来将 $\boldsymbol{v}_1, \boldsymbol{v}_2$ 相加，并对位乘上旋转因子就可以了。

下面就要把这个算法翻译成代码。为了方便描述，我们定义下面的辅助算子：

```cpp
template <int imm>
m256i vshuffle(m256i a) {
    return _mm256_shuffle_epi32(a, imm);
}
template <int imm>
m256i vpermute(m256i a) {
    return _mm256_permute4x64_epi64(a, imm);
}
template <int control>
m256i vblend(m256i x, m256i y) {
    return _mm256_blend_epi32(x, y, control);
}
```

并重写一下 `neg` 算子，使其支持 masked operation：

```cpp
template <int mask = 0xFF>
static m256i neg(m256i x) {
    m256i y = _mm256_sub_epi32(V_P2, x);
    m256i eq = _mm256_cmpeq_epi32(x, _mm256_setzero_si256());
    y = _mm256_andnot_si256(eq, y);
    return mask == 0xFF ? y : vblend<mask>(x, y);
}
```

现在我们就可以比较简洁地写出蝴蝶变换的算子了，顺便还能写出逆变换：

```cpp
template <bool inv>
static m256i butterfly8(m256i v) {
    constexpr auto w8 = inv ? dft_info.irt[3] : dft_info.rt[3],
                   w4 = inv ? dft_info.irt[2] : dft_info.rt[2];
    constexpr auto W1 = vsetr(1, 1, 1, 1, 1, w8, w4, w8 * w4),
                   W2 = vsetr(1, 1, 1, w4, 1, 1, 1, w4);
    if constexpr (!inv) {
        // 0x4E = [2, 3, 1, 2], 0xF0 = [1, 1, 1, 1, 0, 0, 0, 0]
        // 这里的 0x4E 控制的是 64-bit 整数的排列。
        v = mul(add(vpermute<0x4E>(v), neg<0xF0>(v)), W1);
        // 0x4E = [2, 3, 1, 2], 0xCC = [1, 1, 0, 0, 1, 1, 0, 0]
        // 而这里的 0x4E 控制的是 128-bit lane 内部的 32-bit 整数的排列。
        v = mul(add(vshuffle<0x4E>(v), neg<0xCC>(v)), W2);
        // 0xB1 = [1, 0, 3, 2], 0xAA = [1, 0, 1, 0, 1, 0, 1, 0]
        return add(vshuffle<0xB1>(v), neg<0xAA>(v));
    } else {
        // 逆变换。把正变换的每一步都取逆得到。
        v = mul(add(vshuffle<0xB1>(v), neg<0xAA>(v)), W2);
        v = mul(add(vshuffle<0x4E>(v), neg<0xCC>(v)), W1);
        return add(vpermute<0x4E>(v), neg<0xF0>(v));
    }
}
```

要把这个算子加入我们的 `DIF`, `DIT` 函数，我们还需要域处理相应的 radix-8 旋转因子。修改我们的 `_DFTInfo`：

```cpp
constexpr struct _DFTInfo {
    Mint rt[LG_MAXN + 1], irt[LG_MAXN + 1];
    Mint w4d[LG_MAXN - 2], iw4d[LG_MAXN - 2];
    alignas(32) Mint w8d[LG_MAXN - 3][8], iw8d[LG_MAXN - 3][8];

    static constexpr void fillpow(Mint* a, Mint x, int k) {
        a[0] = 1;
        for (int i = 1; i < k; i++) a[i] = a[i - 1] * x;
    }
    constexpr _DFTInfo() {
        Mint prd = qpow(G, (P - 1) >> LG_MAXN), iprd = prd.inv();
        for (size_t i = LG_MAXN; ~i; i--) {
            rt[i] = prd, irt[i] = iprd;
            prd *= prd, iprd *= iprd;
        }
        prd = iprd = 1;
        for (size_t i = 0; i + 3 <= LG_MAXN; i++) {
            w4d[i] = rt[i + 3] * prd, prd *= irt[i + 3];
            iw4d[i] = irt[i + 3] * iprd, iprd *= rt[i + 3];
        }
        prd = iprd = 1;
        for (size_t i = 0; i + 4 <= LG_MAXN; i++) {
            fillpow(w8d[i], rt[i + 4] * prd, 8), prd *= irt[i + 4];
            fillpow(iw8d[i], irt[i + 4] * iprd, 8), iprd *= rt[i + 4];
        }
    }
} dft_info{};
```

然后修改我们的 `DIF`, `DIT`：

```cpp
void DIF(Mint* a, size_t len) {
    /* 省略 */
    } else {
        /* 省略 */
		auto w = vset1(Mint{1});
        for (size_t j = 0; j < len; j += 8) {
            auto v = mul(vload(a + j), w);
            vstore(a + j, butterfly8(v));
            w = mul(w, vload(dft_info.w8d[std::countr_one(j >> 3)]));
        }
    }
}
void DIT(Mint* a, size_t len) {
    /* 省略 */
    } else {
        auto w = vset1(Mint{1});
        for (size_t j = 0; j < len; j += 8) {
            auto v = vload(a + j);
            vstore(a + j, mul(butterfly8(v), w));
            w = mul(w, vload(dft_info.iw8d[std::countr_one(j >> 3)]));
        }
   		/* 省略 */
    }
}
```

至此，我们完成了所有 NTT 运算的向量化。

### 进一步的优化

上面实现的 NTT 已经非常优秀，但是我们仍然可以进一步压榨一点性能。

#### Lazy Lazy Reduction

我们已经将所有运算数的范围放宽到了 $[0, 2P)$。那我们能不能进一步放宽到 $[0, 4P)$ 呢？有时候是可以的。对于那些编译期预处理的数值，或者运算量不在瓶颈上的数值（比如旋转因子），我们可以将其严格规约到 $[0, P)$。因为 Montgomery Multiplication 只要乘积 $< P \cdot R$ 就是正确的，因此一个 $[0, P)$ 的数参与乘法时，另一个乘数可以放松到 $[0, 4P)$。这可以取消 `add`, `sub` 算子的规约，仅仅进行平凡加减法，效果还是很显著的。

#### 底层分块

我们现在采用的计算顺序是迭代式的，一层层进行计算。这样的内存访存模式虽然连续，但是跨度比较大，cache miss 发生的次数较多。为了减少 cache miss，我们需要尽量减少“大跨度”，尽可能在 L1 Cache 覆盖的范围内访存。事实上，DFS 就是一种非常缓存友好的访问模式，但是 DFS 本身是有栈帧的开销的，所以我们也不能无脑地将整个 DIF/DIT 过程都改成递归。比较好的做法是设置一个阈值 $B$，当长度 $> B$ 的时候递归，当长度 $\le B$ 的时候迭代。这里 $B$ 的选取最好是根据 L1 Cache 的大小计算，确保长度为 $B$ 的数组能够完全放进 L1 Cache。

## 高效的多项式算法

接下来，我们将逐步实现多项式全家桶。在这一节我们将实现最基础的多项式乘法、求逆、求 $\ln$、求 $\exp$、开根。实现了这些之后，大部分其它的算法也都可以实现了。

### 内存管理

在所有多项式操作中，有一个跑不开的话题叫做临时数组。所以我们首先要解决一下内存申请的问题。最直观、最传统的方法就是

- 预先开好足够大的静态数组；
- 每次需要用的时候用 `new` 或者 `vector` 动态申请。

这两种的弊端都比较大。静态数组某种程度上浪费空间，并且在工程上不是很健康，扩展性弱。如果是 `new` 或者 `vector` 的话，开销很大，不可避免地会影响性能，特别是在分治乘这种操作次数很多的场景。

我们分析一下我们需要申请的内存的性质：

- 它的首地址需要是 $32$ 位对齐的；
- 它的长度都是 $2$ 的幂次。

两者一结合，解决方案就呼之欲出了：我们需要自己实现一个内存池。`allocate` 的时候，长度要向上取整到二的幂次。如果此时池子里存在这个长度的空闲指针就直接用，否则使用 `std::aligned_alloc` 申请对齐的内存。`deallocate` 的时候，我们不进行 `free`，而是把这个指针加入池子里等待复用。由于申请长度都是 $2$ 的幂次，我们只需要开 $32$ 个 `vector` 就能管理这些内存了。

于是就得到代码：

```cpp

template <typename T, size_t A = alignof(T)>
class AlignedPool {
private:
    static inline bool _cleaned = false;
    static inline struct _PoolObj: std::array<std::vector<T*>, 32> {
        ~_PoolObj() {
            _cleaned = true;
            for (auto& vec: *this) std::ranges::for_each(vec, free);
        }
    } _pool;

    static void free(T* p) {
#ifdef _WIN32
        _aligned_free(p);
#else
        std::free(p);
#endif
    }
    static T* alloc(size_t n) {
#ifdef _WIN32
        return static_cast<T*>(_aligned_malloc(n * sizeof(T), A));
#else
        return static_cast<T*>(std::aligned_alloc(A, n * sizeof(T)));
#endif
    }

public:
    class pointer_type {
    public:
        pointer_type() = default;
        pointer_type(T* p, size_t c): _p(p), _c(c) {}
        pointer_type(const pointer_type& other) = delete;
        pointer_type(pointer_type&& other): _p(other._p), _c(other._c) {
            other._p = nullptr;
            other._c = 0;
        }
        pointer_type& operator=(const pointer_type& other) = delete;
        pointer_type& operator=(pointer_type&& other) {
            std::swap(_p, other._p);
            std::swap(_c, other._c);
            return *this;
        }
        ~pointer_type() { AlignedPool::deallocate(*this); }

        operator auto*() { return _p; }
        operator auto*() const { return _p; }
        auto& operator*() { return *_p; }
        auto& operator*() const { return *_p; }
        auto operator->() { return _p; }
        auto operator->() const { return _p; }
        auto& operator[](size_t i) { return _p[i]; }
        auto& operator[](size_t i) const { return _p[i]; }
        auto capacity() const { return _c; }

    private:
        T* _p = nullptr;
        size_t _c = 0;
    };

    static pointer_type allocate(size_t n) {
        n = std::max(A / sizeof(T), std::bit_ceil(n));
        int k = std::countr_zero(n);
        if (!_pool[k].empty()) {
            T* p = _pool[k].back();
            _pool[k].pop_back();
            return {p, n};
        }
        return {alloc(n), n};
    }
    static void deallocate(pointer_type& p) {
        if (!p) return;
        if (_cleaned) return free(p);
        _pool[std::countr_zero(p.capacity())].push_back(p);
    }
};
```

仔细一想这一段代码的狠活似乎有点多。下面解释一下。

#### 闲置指针数组

先整体解析一下这段：`_pool` 是一个结构体 `_PoolObj`，而类型 `_PoolObj` 的定义在花括号内。其实就是 OIer 经常使用的结构体声明和变量声明揉在一起，只不过多加了几个限定符，结构体声明更复杂了一些。

首先第一段这个 `static inline` 是什么意思呢？这里 `inline` 的作用和 C++ 中 `inline` 函数的作用类似，它允许变量在声明的时候直接定义，并且在不同的编译单元里这种定义可以出现多次而没有重复定义的错误。这都是 C++ 为了 header-only 风格库而添加的设计。比方说，如果在 `lib.hpp` 中有一个变量 `int var = 114514`（无 `inline`），并且 `a.cpp`, `b.cpp` 都包含了这个头文件，那么 `a.cpp`, `b.cpp` 在一起编译链接的时候（比如 `g++ a.cpp b.cpp -o prog`），这个 `var` 就被定义了两次，出现链接器错误。而 `inline` 的作用就是让编译器忽略这个错误，但前提是`inline` 变量出现的所有定义都必须完全等价。

这就引来了一个自然结果：在类内部的非 `const` 的 `static` 变量，不能直接在类内部定义（因为类的声明通常在头文件），除非添加了 `inline`。

```cpp
// a.hpp
struct Foo {
    static int var = 0; // failed
};

// a.hpp
struct Foo {
    static int var; // ok
};
// a.cpp
int Foo::var = 0; // ok

// a.hpp
struct Foo {
    static inline int var; // ok
};
```

所以我们把储存闲置指针的对象声明成了 `inline` 变量，这样我们就不需要显式地再进行一次定义。

同时这里用了一个很诡谲的写法，继承了 `std::array<std::vector<T*>, 32>` 然后定义了一个析构函数。这种写法的逻辑不难理解，就是为了在对象析构之前将其包含的指针释放。这样做是为了严格的放内存泄漏。虽然大部分时候静态变量析构意味着整个程序结束了，所有申请的内存都会被操作系统回收，但如果不管不顾的话还是算内存泄漏的（比如 `-fsanitize=leak` 编译后 Sanitizer 会抛出内存泄漏错误）。

并且我们还有一个 `_cleaned` 标记闲置指针数组是否已经析构，如果已经析构，那么 `pointer_type` 析构时就会直接 `free` 而不是放入内存池。这么做是为了防止 `_pool` 对象和其它 `pointer_type` 对象的析构顺序出现问题。

#### `pointer_type` 的构造和赋值

这里的 `pointer_type` 作为 `allocate` 的返回值包装，内部包含了裸指针和长度信息（便于回收），相当于一个简陋的智能指针。

对于构造和赋值，Modern C++ 要求遵守**[三五零原则](https://cppreference.com/w/cpp/language/rule_of_three.html)**，详细含义在这里不再展开。我们的 `pointer_type` 拥有自定义的析构函数（用来把它塞回 Pool），能够被移动，不能够被拷贝，因此我们要遵守五原则，自己定义析构函数、移动构造、拷贝构造、移动赋值、拷贝赋值。其中：

- 析构函数：如果自身包含的指针不为空，将指针塞回闲置数组；
- 移动构造：直接将 `other` 的指针和长度拿过来，并且将 `other` 的指针清零；
- 移动赋值：注意此时自身可能也有非空的指针，这个指针也需要被释放。因此最安全的方法是将自身的值和 `other` 交换，那么析构的任务就会自动交给 `other`；
- 拷贝构造/拷贝赋值：我们需要禁用，因此声明为 `= delete`。

#### "Auto script"

接下来的这一大段 `auto` 含量极高，但是我们还是仔细来看看是怎么个事。

```cpp
operator auto*() { return _p; }
operator auto*() const { return _p; }
```

这里定义的实际上是一个转换运算符。它把 `pointer_type` 转换为一个指针 `auto*`，其中 `auto` 是什么呢？从返回值推断，是 `T`。所以这是一个转换为 `T*` 的转换运算符。那我为什么不直接写成 `T*` 呢？因为如你所见，这个函数有一个 `const` 约束版本，而 `const` 版本返回的就是 `const T*` 了，而写成 `auto` 的话，编译器可以自己推断，就不需要自己写了，代码看起来也更整洁。现在 `pointer_type` 可以隐式转换为指针，更加方便使用了。

```cpp
auto& operator*() { return *_p; }
auto& operator*() const { return *_p; }
auto operator->() { return _p; }
auto operator->() const { return _p; }
```

这里定义的是解引用运算符和间接成员调用运算符。也是按照标准的要求来定义。同样也有普通版本和 `const` 约束版本，用 `auto` 自动推断返回值类型。

```cpp
auto& operator[](size_t i) { return _p[i]; }
auto& operator[](size_t i) const { return _p[i]; }
```

定义了取下标运算符，也是指针的常用操作。这样我们就可以直接将 `pointer_type` 当作数组用了。

#### `allocate` 和 `deallocate`

这部分的代码就比较好理解了。就是内存池的基本逻辑。

### 基础算子

为了方便各种算法的描述和实现，我们定义下面的算子：

```cpp
// out <- a + b
void add(const Mint* a, const Mint* b, size_t len, Mint* out) {
    size_t i = 0;
    for (; i + 7 < len; i += 8)
        vstore(out + i, add(vload(a + i), vload(b + i)));
    for (; i < len; i++) out[i] = a[i] + b[i];
}
// out <- a - b
void sub(const Mint* a, const Mint* b, size_t len, Mint* out) {
    size_t i = 0;
    for (; i + 7 < len; i += 8)
        vstore(out + i, sub(vload(a + i), vload(b + i)));
    for (; i < len; i++) out[i] = a[i] - b[i];
}
// out <- -a
void neg(const Mint* a, size_t len, Mint* out) {
    size_t i = 0;
    for (; i + 7 < len; i += 8) vstore(out + i, neg(vload(a + i)));
    for (; i < len; i++) out[i] = -a[i];
}
// out <- a \dot b
void dot(const Mint* a, const Mint* b, size_t len, Mint* out) {
    size_t i = 0;
    for (; i + 7 < len; i += 8)
        vstore(out + i, mul(vload(a + i), vload(b + i)));
    for (; i < len; i++) out[i] = a[i] * b[i];
}
// out <- k * a
void scale(const Mint* a, Mint k, size_t len, Mint* out) {
    size_t i = 0;
    const m256i vk = vset1(k);
    for (; i + 7 < len; i += 8) vstore(out + i, mul(vload(a + i), vk));
    for (; i < len; i++) out[i] = a[i] * k;
}
```

另外还有内存操作：

```cpp
void clear(Mint* a, size_t len) {
    std::memset((void*)a, 0, len * sizeof(Mint));
}
void copy(const Mint* a, size_t len, Mint* out, size_t pad = 0) {
    std::memcpy((void*)out, (const void*)a, len * sizeof(Mint));
    if (pad) clear(out + len, pad - len);
}
```

### 多项式乘法

最简单的需要 DFT 的多项式操作。直接实现就可以了：

```cpp
// f <- f * g, assume f, g can both be modified
void polymul(Mint* f, Mint* g, size_t len) {
    DIF(f, len);
    if (f != g) DIF(g, len);
    dot(f, g, len, f);
    DIT(f, len);
}
```

### 多项式求逆

我们回忆一下多项式求逆的牛顿迭代过程。假设我们要求 $F(x)^{-1} \bmod x^N$。我们记 $G_n(x) = F(x)^{-1} \bmod x^n$，那么：

$$
G_{2n}(x) \equiv G_n(x) - G_n(x)(F(x) G_n(x) - 1) \pmod{x^{2n}}
$$

好的，接下来我们要尝试写出一个高效的牛顿迭代过程，我们希望尽量使用长度更短的 DFT，在迭代 $n \to 2n$ 的时候不要使用长度为 $4n$ 的 DFT。下面我们分析一下：

因为 $G_n(x) \equiv F(x)^{-1} \bmod x^n$，因此 $F(x) G_n(x) = 1 + O(x^n)$，也就是说 $F(x) G_n(x) - 1 = O(x^n)$。我们先求出 $F(x) G_n(x)$，我们知道 $\deg \left(F(x) G_n(x)\right) = 3n - 2$。我们直接做长度为 $2n$ 的 DFT，这样卷积得到的结果其实就是一个循环卷积，也就是 $F(x) G_n(x) \bmod \left(x^{2n} - 1\right)$。也就是说，指数 $[2n, 3n)$ 会被累加到 $[0, n)$ 上。但是根据我们之前的分析，$F(x) G_n(x) - 1 = O(x^n)$，因此我们事实上只需要 $F(x) G_n(x)$ 在指数 $[n, 2n)$ 的部分。对于 $[0, n)$ 的部分，不管它是什么，都不重要了，我们直接清零就行。我们记 $R(x) = (F(x) G_n(x) - 1) \bmod x^{2n}$。

下面就是要求 $G_n(x) R(x) \bmod x^{2n}$。这同样是一个总长为 $3n$ 的卷积。但是根据定义，我们知道 $G_{2n}(x) - G_n(x) = O(x^n)$，因此我们同样只需要知道 $G_n(x) R(x)$ 在 $[n, 2n)$ 部分的值。现在就又可以使用上面描述的循环卷积技巧了。

最终我们可以写出代码：

```cpp
// out <- f^{-1}
static void polyinv(const Mint* f, size_t len_f, Mint* out) {
    if (!len_f || f[0] == 0) throw std::invalid_argument("[x^0] is 0");
    out[0] = f[0].inv();
    size_t len = std::bit_ceil(len_f);
    auto t1 = Pool::allocate(len), t2 = Pool::allocate(len);
    for (size_t k = 1, k2 = 2; k < len; k = k2, k2 <<= 1) {
        copy(f, std::min(k2, len_f), t1, k2);
        copy(out, k, t2, k2);
        DIF(t1, k2), DIF(t2, k2), dot(t1, t2, k2, t1), DIT(t1, k2);
        clear(t1, k), DIF(t1, k2), dot(t1, t2, k2, t1), DIT(t1, k2);
        neg(t1 + k, k, out + k);
    }
}
```

提交记录：[258015203](https://www.luogu.com.cn/record/258015203)。截至 2026.1.25 最优解。

### 多项式求导和积分

在讲解多项式对数函数、指数函数之前，我们需要先实现求导和积分算子。

对于求导，我们相当于要让每个序列元素都乘上自己的下标，然后向前平移一位。还是比较容易向量化的，我们只需要动态维护一个包含了下标的向量就可以了：

```cpp
// a <- b'
void polyder(const Mint* f, size_t len, Mint* out) {
    constexpr auto init = vsetr(Mint{1}, 2, 3, 4, 5, 6, 7, 8),
                   step = vset1(Mint{8});
    size_t i = 0;
    for (auto v = init; i + 8 < len; i += 8, v = add(v, step))
        vstore(out + i, mul(v, vloadu(f + i + 1)));
    for (; i + 1 < len; i++) out[i] = Mint{i + 1} * f[i + 1];
    out[len - 1] = 0;
}
```

而对于积分，我们要将下标向后平移一位，然后乘上下标的逆。我们当然不能现场直接求逆，因此我们需要将逆元预处理出来：

```cpp
struct _InvInfo {
    alignas(32) Mint inv[MAXN];
    size_t inv_len = 2;

    _InvInfo() { inv[1] = 1; }
    void prepare(size_t len) {
        for (size_t i = inv_len; i <= len; i++)
            inv[i] = -Mint{P / i} * inv[P % i];
        inv_len = len;
    }
} inv_info;
```

然后为了兼容 `f` 和 `out` 相同的情况，我们需要让循环从后向前。

```cpp
// a <- \int b \dd x
void polyint(const Mint* f, size_t len, Mint* out, Mint C = 0) {
    size_t i = len - 1;
    inv_info.prepare(len);
    for (; i > 0 && (i & 7); i--) out[i] = f[i - 1] * inv_info.inv[i];
    for (; i > 0; i -= 8) {
        auto x = vload(f + i - 8), y = vloadu(inv_info.inv + i - 7);
        vstoreu(out + i - 7, mul(x, y));
    }
    out[0] = C;
}
```

### 多项式对数函数

回忆一下求 $\ln$ 的方法。我们要求 $\ln F(x) \bmod x^N$。方法是先求出 $H(x) = \left(\ln F(x)\right)' = \frac{F'(x)}{F(x)}$，然后再积分回去。通常为了求出 $H(x)$，我们会直接进行求逆和一次乘法，但是这样就需要长度 $2N$ 的 DFT。我们希望能够进行压缩，只进行长度 $\le N$ 的 DFT，可以做到吗？当然，我们要将 $H(x)$ 和 $F(x)^{-1}$ 融合迭代。我们记 $H_n(x) = (\ln F(x))' \bmod x^n,\ G_n(x) = F(x)^{-1} \bmod x^n$。

首先是 $G_n(x)$ 的迭代过程：

$$
G_{2n}(x) \equiv G_n(x) - G_n(x) (F(x) G_n(x) - 1) \pmod{x^{2n}}
$$

我们记 $R(x) = F(x) G_n(x) - 1$，用之前说过的循环卷积技巧求出来。那么：

$$
\begin{aligned}
    H_{2n}(x) & \equiv F'(x) G_{2n}(x) & \pmod{x^{2n}} \\
    & \equiv F'(x) (G_n(x) - G_n(x) R(x)) & \pmod{x^{2n}} \\
    & \equiv F'(x) G_n(x) - \left(F'(x) G_n(x)\right) R(x) & \pmod{x^{2n}}
\end{aligned}
$$

注意 $R(x) = O(x^n)$，因此我们只需要 $F'(x) G_n(x)$ 指数在 $[n, 2n)$ 的部分，也就是说：

$$
H_{2n} (x) \equiv F'(x) G_n(x) - H_n(x) R(x) \pmod{x^{2n}}
$$

同样，因为 $H_{2n}(x) - H_n(x) = O(x^n)$，因此我们只需要右侧式子在 $[n, 2n)$ 的部分。结合循环卷积技巧，仍然只需要长度 $2n$ 的 DFT。

下面是代码：

```cpp
void polyln(const Mint* f, size_t len_f, Mint* out) {
    if (!len_f || f[0] != 1) throw std::invalid_argument("[x^0] is not 1");
    size_t len = std::bit_ceil(len_f);
    auto d = Pool::allocate(len), g = Pool::allocate(len),
         t1 = Pool::allocate(len), t2 = Pool::allocate(len),
         t3 = Pool::allocate(len);
    polyder(f, len_f, d), clear(d + len_f, len - len_f);
    out[0] = d[0], g[0] = 1;
    for (size_t k = 1, k2 = 2; k < len; k = k2, k2 <<= 1) {
        copy(g, k, t1, k2);
        copy(f, std::min(k2, len_f), t2, k2);
        DIF(t1, k2), DIF(t2, k2), dot(t1, t2, k2, t2);
        DIT(t2, k2), clear(t2, k), DIF(t2, k2);
        copy(g, k, t3, k2);
        DIF(t3, k2), dot(t2, t3, k2, t3), DIT(t3, k2);
        neg(t3 + k, k, g + k);
        copy(d, k2, t3), DIF(t3, k2), dot(t3, t1, k2, t1);
        copy(out, k, t3, k2), DIF(t3, k2), dot(t3, t2, k2, t2);
        sub(t1, t2, k2, t3), DIT(t3, k2);
        copy(t3 + k, k, out + k);
    }
    polyint(out, len, out);
}
```

看起来有点恐怖，我们逐步解析一下：

1. 定义数组 `d` 表示 `f` 的导数，对应 $F'(x)$；`g` 表示迭代中的 `f` 的逆元，对应 $G_n(x)$；`out` 就是输出，对应 $H_n(x)$；
2. 进行迭代，代码中的 `k` 就是上面的 $n$。迭代过程（我们用 $T_1, T_2, T_3$ 表示临时数组）：
   1. Line 10~11：$T_1 \gets G_n,\ T_2 \gets F \bmod x^n$；
   2. Line 12~16：进行求逆的迭代操作。完成之后，$T_1 = \operatorname{DFT}(G_n),\ T_2 = \operatorname{DFT}(R)$，且 $G_{2n}$ 就位；
   3. Line 17：$T_3 \gets F' \bmod x^{2n},\ T_1 \gets T_1 \cdot \operatorname{DFT}(T_3)$，现在 $T_1 = \operatorname{DFT}(F' * G_n)$；
   4. Line 18：$T_3 \gets H_n,\ T_2 \gets T_1 \cdot \operatorname{DFT}(T_3)$，现在 $T_2 = \operatorname{DFT}(H_n * R)$；
   5. Line 19~20：$H \gets \operatorname{IDFT}(T_1 - T_2)$，于是 $H_{2n}$ 就位；
3. 最后，将 $H$ 积分，得到正确的 $\ln F(x)$。

提交记录：[257344249](https://www.luogu.com.cn/record/257344249)。截至 2026.1.25 最优解。

### 多项式指数函数

接下来是 $\exp$。我们要求 $E(x) = \mathrm{e}^{F(x)} \bmod x^N$。记 $E_n(x) = \mathrm{e}^{F(x)} \bmod x^n$，根据牛顿迭代法：

$$
E_{2n}(x) \equiv E_n(x) - E_n(x)(\ln E_n(x) - F(x)) \pmod{x^{2n}}
$$

这里最大的瓶颈在于计算 $\ln E_n(x)$。如果直接调用之前的 $\ln$ 函数，每一层都需要一次求逆，常数会很大（很多人的牛顿迭代法 $\exp$ 反而比分治 NTT 慢可能都是这个原因）。但我们仍然可以使用融合迭代的思路。将 $E_n(x), G_n(x) = E_n(x)^{-1} \bmod x^n, \ln E_n(x)$ 一起迭代，可以大幅度减小常数。 现在考虑 $n \to 2n$ 的迭代。

首先要求 $\ln E_{n}(x) \equiv \int E'_n(x) E_n(x)^{-1} \mathrm{d}x \pmod{x^{2n}}$，我们需要将 $G_n(x)$ 的精度提升到 $2n$，也就是说，要求出 $G_{\mathrm{tmp}}(x)$ 使得 $G_{\mathrm{tmp}}(x) E_n(x) = 1 + O(x^{2n})$。根据牛顿迭代公式：

$$
G_{\mathrm{tmp}}(x) \equiv G_n(x)(2 - G_n(x) E_n(x)) \pmod{x^{2n}}
$$

由于仍然满足 $G_{\mathrm{tmp}} (x) - G_n(x) = O(x^n)$，我们仍然只需要右式的 $[n, 2n)$ 部分。而 $G_n(x)^2 E_n(x)$ 的次数是 $3n - 1$，我们又可以使用循环卷积的技巧来做。然后我们计算 $\ln E_n(x) = \int E'_n(x) G_{\mathrm{tmp}}(x) \mathrm{d} x \bmod x^{2n}$。注意 $E_n(x)$ 的定义，我们有 $\ln E_n(x) - F(x) = O(x^n)$，因此我们仍然是只需要 $[n, 2n)$ 部分，又是循环卷积技巧：

现在我们计算差 $\Delta(x) = \left(\ln E_n(x) - F(x)\right) \bmod x^{2n}$，那么我们就可以更新 $E_{2n}(x)$ 和 $G_{2n}(x)$：

$$
\begin{aligned}
    E_{2n}(x) & \equiv E_n(x) (1 - \Delta(x)) & \pmod{x^{2n}} \\
    G_{2n}(x) & \equiv G_n(x) (2 - G_n(x) E_{2n}(x)) & \pmod{x^{2n}} \\
    & \equiv G_n(x) (2 - G_n(x) E_n(x)(1 - \Delta(x))) & \pmod{x^{2n}} \\
    & \equiv G_{\mathrm{tmp}}(x) + G_n(x)^2 E_n(x) \Delta(x) & \pmod{x^{2n}}
\end{aligned}
$$

因为 $\Delta(x) = O(x^n)$，并且 $G_n(x) E_n(x) = 1 + O(x^n)$，所以：

$$
G_{2n}(x) \equiv G_{\mathrm{tmp}}(x) + G_n(x) \Delta(x) \pmod{x^{2n}}
$$

而且我们发现 $E_{2n}(x), G_{2n}(x)$ 的迭代式都是长度为 $3n$ 的卷积，并且仍然只需要 $[n, 2n)$，所以又可以使用循环卷积技巧。写出代码：

```cpp
// out <- exp(f)
void polyexp(const Mint* f, size_t len_f, Mint* out) {
    if (!len_f) return;
    if (f[0] != 0) throw std::invalid_argument("[x^0] is not 0");
    size_t len = std::bit_ceil(len_f);
    auto g = Pool::allocate(len), t1 = Pool::allocate(len),
         t2 = Pool::allocate(len), t3 = Pool::allocate(len),
         t4 = Pool::allocate(len);
    out[0] = g[0] = 1;
    for (size_t k = 1, k2 = 2; k < len; k = k2, k2 <<= 1) {
        copy(out, k, t1, k2), DIF(t1, k2);
        copy(g, k, t2, k2), DIF(t2, k2);
        for (size_t i = 0; i < k2; i += 8) {
            m256i x = vload(t1 + i), y = vload(t2 + i);
            vstore(t3 + i, mul(neg(x), mul(y, y)));
        }
        DIT(t3, k2), copy(g, k, t3), DIF(t3, k2);
        polyder(out, k, t4), clear(t4 + k, k);
        DIF(t4, k2), dot(t4, t3, k2, t4), DIT(t4, k2);
        polyint(t4, k2, t4);
        sub(t4 + k, f + k, std::min(len_f, k2) - k, t4 + k);
        clear(t4, k), DIF(t4, k2);
        for (size_t i = 0; i < k2; i += 8) {
            m256i d = vload(t4 + i);
            vstore(t1 + i, mul(vload(t1 + i), sub(V_R, d))); // 这里 V_R 实际上就是蒙域下的全 1 向量
            vstore(t2 + i, add(vload(t3 + i), mul(vload(t2 + i), d)));
        }
        DIT(t1, k2), copy(t1 + k, k, out + k);
        DIT(t2, k2), copy(t2 + k, k, g + k);
    }
}
```

下面进行解析：

1. 定义临时数组。我们的 `out` 对应 $E$，`g` 对应 $G$。`t1`~`t4` 为临时数组；

2. 进行迭代。在一轮迭代中：

   1. Line 11~12：$T_1 \gets \operatorname{DFT}(E_n),\ T_2 \gets \operatorname{DFT}(G_n)$；
   2. Line 13~16：计算 $T_3 \gets -T_1 \cdot T_2 \cdot T_2 = \operatorname{DFT}(-E_n * G_n * G_n)$；
   3. Line 17：IDFT，修复低位，DFT。现在 $T_3 = \operatorname{DFT}(G_{\mathrm{tmp}})$；
   4. Line 18~20：计算对数，先 $T_4 \gets \operatorname{IDFT}(\operatorname{DFT}(E_n') \cdot T_3) = G_{\mathrm{tmp}} * E_n'$。然后将 $T_4 \gets \int T_4$。现在 $T_4 = \ln E_n$；
   5. Line 21~22：计算 $\Delta$，将 $T_4 \gets T_4 - F$，并清空低位，然后 DFT。现在 $T_4 = \operatorname{DFT}(\Delta)$；
   6. Line 23~27：根据迭代式计算 $E_{2n}, G_{2n}$，$T_1 \gets T_1 \cdot (1 - \Delta),\ T_2 \gets T_3 + T_2 \cdot \Delta$。现在 $T_1 = \operatorname{DFT}(E_{2n}),\ T_2 = \operatorname{DFT}(G_{2n})$；
   7. Line 28~29：更新高位，完成迭代。

   提交记录：[257239150](https://www.luogu.com.cn/record/257239150)。截至 2026.1.25 最优解。

### 多项式开根

我们要求 $G(x) = \sqrt{F(x)} \bmod x^N$，其中 $[x^0] F(x) \neq 0$。同样地，记 $G_n(x) = \sqrt{F(x)} \bmod x^n$，迭代式：

$$
G_{2n}(x) \equiv G_{n}(x) - \frac{1}{2} G_n(x)^{-1} \left(G_n(x)^2 - F(x)\right) \pmod{x^{2n}}
$$

同样，我们要让 $G_n(x)$ 和 $H_n(x) = G_n(x)^{-1} \bmod x^n$ 融合迭代。因为 $G_n(x)^2 - F(x) = 1 + O(x^n),\ G_n(x)^{-1} - H_n(x) = O(x^n)$，所以我们有：

$$
G_{2n}(x) \equiv G_n(x) - \frac{1}{2} H_n(x) \left(G_n(x)^2 - F(x)\right) \pmod{x^{2n}}
$$

这里是长度为 $3n$ 的卷积，而我们还是只需要 $[n, 2n)$ 部分，现在不用说也知道要怎么做了。

```cpp
// out <- sqrt(f)
void polysqrt(const Mint* f, size_t len_f, Mint* out) {
    if (!len_f || f[0]() == 0) throw std::invalid_argument("[x^0] is 0");
    auto out0 = sqrt(f[0]);
    if (!out0) throw std::invalid_argument("sqrt does not exist");
    size_t len = std::bit_ceil(len_f);
    auto h = Pool::allocate(len), t1 = Pool::allocate(len),
         t2 = Pool::allocate(len), t3 = Pool::allocate(len);
    out[0] = out0.transform([](auto x) { return std::min(x(), P - x()); })
                 .value();
    h[0] = out[0].inv();
    for (size_t k = 1, k2 = 2; k < len; k = k2, k2 <<= 1) {
        copy(f, std::min(k2, len_f), t1, k2), DIF(t1, k2);
        copy(out, k, t2, k2), DIF(t2, k2);
        copy(h, k, t3, k2), DIF(t3, k2);
        for (size_t i = 0; i < k2; i += 8) {
            constexpr auto C = vset1(-Mint{2}.inv());
            auto vf = vload(t1 + i), vg = vload(t2 + i), vh = vload(t3 + i);
            vstore(t1 + i, mul(sub(mul(vg, vg), vf), mul(vh, C)));
        }
        DIT(t1, k2), copy(out, k, t1), copy(t1 + k, k, out + k);
        DIF(t1, k2), dot(t1, t3, k2, t1), DIT(t1, k2);
        clear(t1, k), DIF(t1, k2), dot(t1, t3, k2, t1), DIT(t1, k2);
        neg(t1 + k, k, h + k);
    }
}
```

这里 `sqrt(f[0])` 是 Cipolla 算法实现的二次剩余，返回值是 `std::optional<Mint>`。

提交记录：[258271108](https://www.luogu.com.cn/record/258271108)。截至 2026.1.25 最优解。

## 优雅封装

讲了很多技术、数学和算法，现在我们换换脑子，来讲一点偏软件工程的内容。我们要如何封装出一个好用的、合乎 Modern C++ 思想的多项式库，并且不损失性能？

我将讲解我选择的实现方法，可能有其他的方法，也可能有更好的方法，

### 面向对象

毫无疑问，多项式简直太适合面向对象了。所以我们使用一个模板类 `cp::FPoly` 来封装多项式的所有操作：

```cpp
namespace cp
{

template <u32 P, size_t _MAXN = size_t(-1)>
class FPoly;

} // namespace cp
```

这里的 `P` 是模数，而 `_MAXN` 是最大的可能长度，设置成 `size_t(-1)` 就表示未知，按照 `P` 进行计算。这里取名为 `FPoly` 的原因是它代表 $\mathbb{F}_p$ 上的形式幂级数，即 $\mathbb{F}_p [\![x]\!]$。

为了让我们的逻辑更加清晰，我们将要让底层的多项式算法和外层的包装逻辑分离。

### 封装多项式算子

我们将多项式操作的各种算子都放在 `cp::detail` 命名空间下的 `PolyUtils` 类内部，作为静态成员函数。同时 `AlignedPool` 也放进 `cp::detail` 内。

```cpp
namespace cp::detail
{

template <typename T, size_t A = alignof(T)>
class AlignedPool;

template <u32 P, size_t _MAXN>
struct PolyUtils {
    using Mint = SModint<P>;
    using Pool = AlignedPool<Mint, 32>;
    using m256i = __m256i;

    static m256i vload(const void* p);
    static m256i vloadu(const void* p);
    static void vstore(void* p, m256i a);
    static void vstoreu(void* p, m256i a);
    static constexpr m256i vset1(u32 x);
    static constexpr m256i vsetr(u32 v0, u32 v1, u32 v2, u32 v3, u32 v4, u32 v5,
                                 u32 v6, u32 v7);
    static constexpr m256i vset1(Mint x);
    static constexpr m256i vsetr(Mint v0, Mint v1, Mint v2, Mint v3, Mint v4,
                                 Mint v5, Mint v6, Mint v7);
    template <int imm>
    static m256i vshuffle(m256i a);
    template <int imm>
    static m256i vpermute(m256i a);
    template <int control>
    static m256i vblend(m256i x, m256i y);

    static constexpr struct _DFTInfo dft_info{};
    static inline struct _InvInfo inv_info{};

    static m256i add(m256i x, m256i y);
    static m256i sub(m256i x, m256i y);
    template <int mask = 0xFF>
    static m256i neg(m256i x);
    static m256i mul(m256i x, m256i y);

    static void clear(Mint* a, size_t len);
    static void copy(const Mint* a, size_t len, Mint* out, size_t pad = 0);

    static void add(const Mint* a, const Mint* b, size_t len, Mint* out);
    static void sub(const Mint* a, const Mint* b, size_t len, Mint* out);
    static void neg(const Mint* a, size_t len, Mint* out);
    static void dot(const Mint* a, const Mint* b, size_t len, Mint* out);
    static void scale(const Mint* a, Mint k, size_t len, Mint* out);

    static void DIF(Mint* a, size_t len);
    static void DIT(Mint* a, size_t len);

    static void polyder(const Mint* f, size_t len, Mint* out);
    static void polyint(const Mint* f, size_t len, Mint* out, Mint C = 0);
    static void polymul(Mint* f, Mint* g, size_t len);
    static void polyinv(const Mint* f, size_t len_f, Mint* out);
    static void polyln(const Mint* f, size_t len_f, Mint* out);
    static void polyexp(const Mint* f, size_t len_f, Mint* out);
    static void polysqrt(const Mint* f, size_t len_f, Mint* out);
};

} // namespace cp::detail
```

看看 `PolyUtils` 需要什么：DFT 需要知道原根，`inv_info` 需要知道最大可能的长度是多少……这些信息要如何得到呢？显然靠用户提供或者硬编码还是太低端了。我们选择使用编译期计算的方式将这些参数直接算出来。

首先，`P` 必须是一个质数。从 C++17 开始，只要 lambda 表达式的内容满足 constexpr 约束，那么其默认就是 constexpr 的。所以我们可以在 `PolyUtils` 中写出下面的代码：

```cpp
static constexpr bool is_prime = [] {
    for (u32 i = 2; (u64)i * i <= P; i++)
        if (P % i == 0) return false;
    return true;
}();
static_assert(is_prime, "P must be prime number");
```

这样就会在 `P` 不是质数的时候得到一个编译错误。

然后，我们要求原根。根据通常的求原根方法，我们只需要枚举候选然后验证其是不是原根就行了。通常最小原根的量级在 $O\left(\sqrt[4]{P}\right)$ 以下，这是可以接受的。从 C++20 开始，`std::vector` 也是 constexpr 的，这也简化了我们代码的编写：

```cpp
static constexpr Mint G = [] {
    u32 phi = P - 1, tmp = phi;
    std::vector<u32> divs;
    for (u32 i = 2; (u64)i * i <= tmp; i++) {
        if (tmp % i == 0) divs.push_back(i);
        while (tmp % i == 0) tmp /= i;
    }
    if (tmp > 1) divs.push_back(tmp);
    for (u32 g = 2; g < P; g++) {
        bool ok = true;
        for (auto i: divs) {
            if (qpow(Mint{g}, phi / i) == Mint{1}) {
                ok = false;
                break;
            }
        }
        if (ok) return Mint{g};
    }
    return Mint{};
}();
```

然后，我们还需要知道最大的可能长度，这个就比较简单了：

```cpp
static constexpr size_t LG_MAXN = std::countr_zero(P - 1),
                        MAXN = std::min(_MAXN, size_t(1) << LG_MAXN);
```

最后，我们引入一系列需要在 DFT 等过程中使用的常量：

```cpp
static constexpr const auto& M = Mint::mont; // 包含 Montgomery Multiplication 需要的信息，见 SModint 的定义
static constexpr m256i V_P = vset1(P), V_P2 = vset1(2 * P),
                       V_R = vset1(M.R), V_R2 = vset1(M.R2),
                       V_P_INV = vset1(M.P_INV),
                       V_I = vset1(dft_info.rt[2]),
                       V_I_INV = vset1(dft_info.irt[2]);
```

现在，所有在编译期需要计算的内容都完成了。这些信息在编译的时候就会准备好，以常量的形式写入可执行文件内部，除了加载之外，不会占用任何运行时的开销。编译期计算固然很有用，但当然也不能滥用。编译期计算的速度比正常计算速度要慢得多，并且大部分编译器都会设置一个 constexpr 函数内部的 step limit，大部分 OJ 也会有 Compiler Time Limit。同时，计算出来的常量需要写入可执行文件内，这是会导致文件体积膨胀的。假设你真的在编译期计算出来了一个大小为 $2^{20}$ 的 `int` 数组，那么它就会实打实地让你的可执行文件大小增加 $4\,\mathrm{MiB}$。当你需要使用编译期计算的时候，控制好时空复杂度也十分重要。

至此我们就把多项式算子都封装完成，接下来进入外层包装。

### 封装多项式类

#### 基本内容

现在开始实现 `cp::FPoly`。首先这个类内部需要有一个指针 `_data`，指向储存系数的内存，还要有一个长度 `_len`，表示多项式的度数（为了更符合编程习惯，我们令 `_len` 为度数 $-1$，即最高次项的次数是 `_len - 1`）。`_data` 指向的内存也需要是对齐的，因此我们直接使用 `cp::detail::AlignedPool`。下面我们就可以写出 `cp::FPoly` 的成员和默认构造函数：

```cpp

template <u32 P, size_t _MAXN = size_t(-1)>
class FPoly {
public:
    using U = detail::PolyUtils<P, _MAXN>;
    using Mint = U::Mint;
    using Pool = U::Pool;

private:
    size_t _len = 0;
    Pool::pointer_type _data{};

public:
    FPoly() = default;
};
```

我们把算子包装类、Modint 类、Pool 类做成公开成员，这样更方便使用公开接口来进行功能扩展，并且对封装性没有太大的破坏。

我们的多项式类需要支持拷贝，因此我们需要拷贝构造函数和拷贝赋值运算符。但是与三原则稍微不同的是，这里我们不需要实现自定义的析构函数，因为 `Pool::pointer_type` 的析构函数已经自动完成了资源释放，我们只需要默认的析构函数就行了。移动构造函数也可以直接使用编译器的默认函数（但是这里需要显示声明为 `default`，因为在有用户自定义拷贝构造、拷贝赋值时，编译器不会自动生成移动构造和移动赋值）。

```cpp
FPoly(FPoly&& other) = default;
FPoly(const FPoly& other): _data() {
    _len = other._len;
    _data = Pool::allocate(_len);
    U::copy(other._data, _len, _data);
}
FPoly& operator=(FPoly&& other) = default;
FPoly& operator=(const FPoly& other) { return *this = FPoly(other); } // 调用拷贝构造和移动赋值
```

#### 实现容器功能

直觉上，多项式常常被视为一个系数数组，因此其应该有类似于 `vector` 的操作。因此我们需要让 `FPoly` 能够像容器一样被使用。用 Rust 风格的话讲，我们需要实现 `AsRef<[Mint]>`, `Index<usize>`, `IndexMut<usize>`, `IntoIterator<T>`, `FromIterator<T>` 等 trait。用 C++ 风格的话讲，我们需要让类满足 `std::ranges::random_access_range`, `std::ranges::contiguous_range` 等 concept。

首先我们需要实现更改多项式的长度的功能，这里仿照了 `std::vector` 的接口，实现了 `resize` 和 `reserve`：

```cpp
void resize(size_t sz) {
    reserve(sz);
    if (sz > _len) U::clear(_data + _len, sz - _len);
    _len = sz;
}
void reserve(size_t sz) {
    if (sz > _data.capacity()) {
        auto new_data = Pool::allocate(sz);
        U::copy(_data, _len, new_data);
        _data = std::move(new_data);
    }
}
void clear() { _len = 0; }
auto size() const { return _len; }
```

再加入 `push_back`, `pop_back` 的接口，方便一些使用：

```cpp
void push_back(Mint x) { resize(_len + 1), _data[_len - 1] = x; }
void pop_back() { _len--; }
```

然后我们要支持随机下标访问：

```cpp
Mint& operator[](size_t idx) { return _data[idx]; }
Mint operator[](size_t idx) const { return _data[idx]; }
```

最后我们要实现 `begin()`, `end()` 成员。我们选择裸指针做为迭代器类型，其能自动满足 `std::contiguous_iterator` 的要求，让 `FPoly` 满足 `std::ranges::contiguous_range`。

```cpp
auto data() { return (Mint*)_data; }
auto data() const { return (const Mint*)_data; }
auto begin() { return (Mint*)_data; }
auto begin() const { return (const Mint*)_data; }
auto end() { return begin() + _len; }
auto end() const { return begin() + _len; }
```

#### 各种构造函数

类似于 `std::vector`，我们提供一个构造函数来创建指定长度的空多项式。这里我们额外加入一个参数 `bool no_init`，来指定是否清零，这在一些场景（比如构造后马上进行赋值）可以获得更极致的性能。

```cpp
explicit FPoly(size_t n, bool no_init = false):
    _len{n}, _data{Pool::allocate(n)} {
    if (!no_init) U::clear(_data, n);
}
```

我们再给 `FPoly` 添加一个接受 `std::initializer_list` 的构造函数。这样我们就能使用 `cp::FPoly{1, 1, 4, 5, 1, 4}` 这种更方便的方法来构造多项式了：

```cpp
FPoly(const std::initializer_list<Mint>& init):
    _len{init.size()}, _data{Pool::allocate(_len)} {
    U::copy(init.begin(), init.size(), _data);
}
```

接下来，我们希望能够给 `FPoly` 添加从范围或迭代器-哨兵对构造的功能。比如你有一个数组 `a`，我们希望能够构造 `FPoly(a, a + n)`。最简单的方法当然是逐个 `push_back`。但是我们要做得更加高效。所以我们要使用一些 C++20 特性，对输入的 range 进行一系列检查。C++20 开始引入了 concepts 和 requires，这让我们可以更加方便地对类型的性质进行检查。相对于古早的 SFINAE，功能更强大，便捷性也更高。

> 简单来说，requires 是给一个模板（函数、变量或类）添加约束条件，而 concepts 就是在定义一个对类型的约束。它有点像 Rust 中的 traits。
>
> 比如，我们可以这样定义一个 concept 来检查一个类型 `T` 是不是 $\ge 32$ 位的整型：
>
> ```cpp
> template <typename T>
> concept least32_integral = std::integral<T> && (sizeof(T) >= 4)
> ```
>
> 其中 `std::integral` 是一个标准 concept。然后我们可以在模板中这样使用它，约束参数 `x` 必须满足 `least32_integral`：
>
> ```cpp
> template <least32_integral T>
> void func(T x);
> // or
> template <typename T>
>     requires least32_integral<T>
> void func(T x);
> ```
>
> 这里又引入了 requires 语句。requires 语句格式是关键字 `requires` 跟着一个 bool 表达式或者 concept 表达式（虽然 concept 可以隐式转换成 bool，但是重载决议中有关于约束之间的偏序关系，所以在 requires 语句中 concept 一般不会被转成 bool 处理）。顾名思义，requires 语句就是要求其后跟着的表达式成立时，这个函数才会被启用。
>
> 除了 requires 语句之外，还有 requires 表达式。requires 表达式可以检测一系列表达式是否合法，并返回一个 bool 值，比如标准中对 `std::ranges::range` 的定义：
>
> ```cpp
> template <typename R>
> concept range = requires(R& r) {
>     ranges::begin(r);
>     ranges::end(r);
> };
> ```
>
> 由于在本篇文章没有用到，在此不展开 requires 表达式的用法。

首先我们定义一些 helper concept：

```cpp
namespace detail
{

template <typename T, typename Mint>
concept init_friendly_type =
    std::same_as<T, u32> || std::same_as<T, i32> || std::same_as<T, Mint>;

template <typename R, typename Mint>
concept can_fast_init = std::ranges::contiguous_range<R> &&
                        init_friendly_type<std::ranges::range_value_t<R>, Mint>;

} // detail
```

其中 `R` 是 range 类型，而 `T` 是值类型，`Mint` 是多项式类对应的 modint 类型。翻译一下就是，若 `R` 是连续范围，并且 `T` 类型为 `i32`, `u32`, `Mint` 之一，我们就能进行快速的初始化。具体来讲：

- 首先连续范围是基础，否则我们无法使用任何高效办法；
- 若 `T` 就是 `Mint`，我们可以直接进行高效的 `memcpy`；
- 若 `T` 是 `i32` 或者 `u32`，我们可以使用 SIMD 优化转入蒙域的过程（乘 $2R$）。

所以我们可以写出代码：

```cpp
template <detail::can_fast_init<Mint> R>
    requires (!std::same_as<std::remove_cvref_t<R>, FPoly>)
FPoly(R&& r): FPoly(std::ranges::size(r), true) {
    using T = std::ranges::range_value_t<R>;
    auto data = std::ranges::data(r);
    if constexpr (std::same_as<T, Mint>) {
        // 直接进行拷贝
        U::copy(data, _len, _data);
    } else {
        size_t i = 0;
        for (; i + 7 < _len; i += 8) {
            // 注意使用 vloadu，可能不对齐
            auto v = U::vloadu(data + i);
            if constexpr (std::is_signed_v<T>) {
                // 如果是有符号，先加一个数，保证其为正
                v = _mm256_add_epi32(v, U::vset1((1u << 31) / P * P));
            }
            // 进行常规转蒙域操作
            U::vstore(_data + i, U::mul(v, U::V_R2));
        }
        for (; i < _len; i++) _data[i] = Mint{data[i]};
    }
}
```

对于一般的 input range，我们只能使用朴素的 `push_back` 策略：

```cpp
template <std::ranges::input_range R>
    requires std::convertible_to<std::ranges::range_value_t<R>, Mint> &&
             (!detail::can_fast_init<R, Mint>) &&
             (!std::same_as<std::remove_cvref_t<R>, FPoly>)
FPoly(R&& r) {
    if constexpr (std::ranges::sized_range<R>) {
        // 如果已知大小，先进行 reserve
        reserve(std::ranges::size(r));
    }
    for (auto&& x: r) push_back(std::forward<decltype(x)>(x));
}
```

虽然 concept 之间支持析取 `&&` 与合取 `||`，但是并不支持取反（显然取反会让在偏序关系难以推断），所以我们在需要取反的时候，需要给表达式套上括号，让它“退化”成一个一般的 bool 表达式。这两个函数中加入 `!can_fast_init<R, T>`, `!std::same_as<std::remove_cvref_t<R>, FPoly>` 等约束的目的是避免构造函数之间出现重载歧义。虽然 C++ 的 concept 检查很强大，但是面对复杂的逻辑还是不够的，因此我们手动补全排除的逻辑。

我们发现 `std::initializer_list` 也是满足 `can_fast_init` 的，所以我们可以改成一个简单的转发：

```cpp
FPoly(const std::initializer_list<Mint>& init):
    FPoly(std::views::all(init)) {} // 这里不直接写 FPoly(init) 是为了避免递归调用。
```

然后我们也可以编写一个迭代器-哨兵对风格的构造函数：

```cpp
template <std::input_iterator Iter, std::sentinel_for<Iter> Sent>
FPoly(Iter begin, Sent end): FPoly(std::ranges::subrange(begin, end)) {}
```

好的，基础设施建造完毕。下面我们封装各种运算。

#### 运算符

首先我们给出 `+=`, `-=`, `*=` 运算符，这些运算符都是原地计算，最简单也最基础：

```cpp
FPoly& operator+=(const FPoly& other) {
    if (other._len > _len) resize(other._len);
    U::add(_data, other._data, other._len, _data);
    return *this;
}
FPoly& operator-=(const FPoly& other) {
    if (other._len > _len) resize(other._len);
    U::sub(_data, other._data, other._len, _data);
    return *this;
}
FPoly& operator*=(FPoly other) {
    if (_len == 0 || other._len == 0) return clear(), *this;
    size_t n = _len + other._len - 1, nn = std::bit_ceil(n);
    resize(nn);
    other.resize(nn);
    U::polymul(_data, other._data, nn);
    return resize(n), *this;
}
FPoly& operator*=(Mint k) {
    U::scale(_data, k, _len, _data);
    return *this;
}
```

为什么 `operator*=` 的参数类型是 `FPoly` 而不是 `const FPoly&` 呢？因为我们在做多项式乘法的时候是要求传入的数组可以被修改的。因此若参数是一个右值，我们可以直接拿过来用；若参数是一个左值，我们就得复制一份。而使用 `FPoly other` 声明参数就可以完美解决。这样对于右值，会使用移动构造来传参；对于左值，则使用复制构造来传参。

然后我们定义 `+`, `-`, `*` 运算符：

```cpp
friend FPoly operator-(FPoly f) {
    return U::neg(f._data, f._len, f._data), std::move(f);
}
friend FPoly operator+(FPoly f, const FPoly& g) {
    return std::move(f += g);
}
friend FPoly operator-(FPoly f, const FPoly& g) {
    return std::move(f -= g);
}
friend FPoly operator*(FPoly f, FPoly g) {
    return std::move(f *= std::move(g));
}
friend FPoly operator*(Mint k, FPoly f) { return std::move(f *= k); }
friend FPoly operator*(FPoly f, Mint k) { return std::move(f *= k); }
```

在这里我们使用 `FPoly f` 声明参数的理由也是一样的，我们需要一个能被修改的值，这样声明能够自动处理左值和右值。注意在 `operator*` 转发给 `operator*=` 的时候要写一个 `std::move`，不然就会发生一次额外的无用复制。返回值也都使用 `std::move(f)` 包装。虽然 C++ 有 NRVO，允许在使用 `return val;` 这种表达式时直接将 `val` 对象在目标栈帧上构建，但是 NRVO 不适用于函数形参，因此我们选择使用显式的移动构造。

#### 其它函数

接下来我们要给出 `ln`, `exp` 等操作的封装。为了保持自然的数学表达式风格，我们不把它们写成成员函数，而是写成外部函数。因为我们将算子写成了公开接口，所以基本只需要已经写好的算子封装一下就可以了：

```cpp

#define Poly FPoly<Q, N>
#define U Poly::U
template <u32 Q, size_t N>
Poly integrate(Poly f) {
    f.resize(f.size() + 1);
    U::polyint(f.data(), f.size(), f.data());
    return f;
}

template <u32 Q, size_t N>
Poly derivative(Poly f) {
    if (f.size() == 0) return f;
    U::polyder(f.data(), f.size(), f.data());
    f.resize(f.size() - 1);
    return f;
}

template <u32 Q, size_t N>
Poly inv(const Poly& f) {
    Poly res(f.size(), true);
    U::polyinv(f.data(), f.size(), res.data());
    return res;
}

template <u32 Q, size_t N>
Poly ln(const Poly& f) {
    Poly res(f.size(), true);
    U::polyln(f.data(), f.size(), res.data());
    return res;
}

template <u32 Q, size_t N>
Poly exp(const Poly& f) {
    Poly res(f.size(), true);
    U::polyexp(f.data(), f.size(), res.data());
    return res;
}

template <u32 Q, size_t N>
Poly sqrt(const Poly& f) {
    int k = std::ranges::find_if(f, [](auto x) { return x(); }) - f.begin();
    if (k % 2 != 0) throw std::invalid_argument("sqrt does not exist");
    Poly res(f.size(), true);
    if (k == 0) U::polysqrt(f.data(), f.size(), res.data());
    else {
        auto tmp = U::Pool::allocate(f.size());
        U::copy(f.data() + k, f.size() - k, tmp, f.size());
        U::polysqrt(tmp, f.size(), res.data());
        std::memmove(res.data() + k / 2, res.data(), f.size() - k / 2);
        U::clear(res.data(), k / 2);
    }
    return res;
}

template <u32 Q, size_t N>
std::pair<Poly, Poly> div(const Poly& f, const Poly& g) {
    size_t n = f.size(), m = g.size();
    if (m == 0) throw std::invalid_argument("divider is empty");
    if (n < m) return {{}, f};
    Poly h(n - m + 1, true), q(n - m + 1, true), r{};
    for (size_t i = 0; i < n - m + 1; i++) {
        q[i] = f[n - 1 - i];
        h[i] = i > m - 1 ? 0 : g[m - 1 - i];
    }
    q *= inv(h), q.resize(n - m + 1), std::ranges::reverse(q);
    r = f - q * g, r.resize(m - 1);
    return {std::move(q), std::move(r)};
}
#undef Poly
#undef U
```

这里传参全部都用的是 `const Poly&`，因为这四个算子都不需要进行原地的修改，所以我们不需要对左值右值分别讨论，直接引用传递就可以了。另外，因为 `polysqrt` 算子仅支持 $[x^0] F(x) \neq 0$ 的开根，所以我们在外部的 `sqrt` 接口中也加入常数项为 $0$ 的开根逻辑。

## 其它多项式操作

现在我们有了一个很高效、很好看的多项式模板，那么我们来试试其它的多项式题。

### 多项式带余除法

我们可以编写一个函数 `div` 来做多项式带余除法。基本上就是那套标准的 reverse+求逆的做法。除法操作的各个步骤耦合度都不高，只用公开接口就可以高效实现。

```cpp
#define Poly cp::FPoly<Q, N>
template <u32 Q, size_t N>
std::pair<Poly, Poly> div(const Poly& f, const Poly& g) {
    size_t n = f.size(), m = g.size();
    if (m == 0) throw std::invalid_argument("divider is empty");
    if (n < m) return {f, {}};
    Poly h(n - m + 1, true), q(n - m + 1, true), r{};
    for (size_t i = 0; i < n - m + 1; i++) {
        q[i] = f[n - 1 - i];
        h[i] = i > m - 1 ? 0 : g[m - 1 - i];
    }
    q *= inv(h), q.resize(n - m + 1), std::ranges::reverse(q);
    r = f - q * g, r.resize(m - 1);
    return {std::move(q), std::move(r)};
}
#undef Poly
```

提交记录：[258056151](https://www.luogu.com.cn/record/258056151)。截至 2026.1.25 最优解。

### 多项式三角函数

利用欧拉公式：

$$
\begin{gathered}
    \sin x = \frac{\mathrm{e}^{\mathrm{i} x} - \mathrm{e}^{-\mathrm{i} x}}{2 \mathrm{i}} \\
    \cos x = \frac{\mathrm{e}^{\mathrm{i} x} + \mathrm{e}^{-\mathrm{i} x}}{2}
\end{gathered}
$$

模 $998244353$ 意义下 $\mathrm{i}$ 有值，所以我们直接写出代码：

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 17)>;

unsigned a[100005];

int main() {
    auto [n, type] = qin.scan<int, int>().value();
    for (int i = 0; i < n; i++) a[i] = qin.scan<int>().value();

    constexpr Mint I = qpow(Mint{3}, (MOD - 1) / 4);
    Poly f = exp(Poly(a, a + n) * I), g = inv(f), res;
    if (type == 0) {
        res = (f - g) * (2 * I).inv();
    } else {
        res = (f + g) * Mint{2}.inv();
    }
    for (int i = 0; i < n; i++) qout.print(res[i]()), qout.print(' ');
    qout.print('\n');
    return 0;
}
```

提交记录：[258032935](https://www.luogu.com.cn/record/258032935)。截至 2026.1.25 最优解。

### 多项式反三角函数

利用性质：

$$
\begin{aligned}
    (\arcsin f(x))' = \frac{f'(x)}{\sqrt{1 - f(x)^2}} \\
    (\arctan f(x))' = \frac{f'(x)}{1 + f(x)^2} \\
\end{aligned}
$$

先求导再积分回去即可。

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 18)>;

unsigned a[100005];

int main() {
    auto [n, type] = qin.scan<int, int>().value();
    for (int i = 0; i < n; i++) a[i] = qin.scan<int>().value();

    Poly f(a, a + n), q = f * f, res;
    q.resize(n);
    if (type == 0) {
        res = derivative(std::move(f)) / sqrt(Poly{1} - q);
    } else {
        res = derivative(std::move(f)) / (Poly{1} + q);
    }
    res = integrate(res);
    for (int i = 0; i < n; i++) qout.print(res[i](), "");
    qout.print('\n');
    return 0;
}
```

提交记录：[258944625](https://www.luogu.com.cn/record/258944625)。截至 2026.1.25 最优解。

### 常系数齐次线性递推

先随手糊一个快速幂加取模的做法。

$$
F(x) = x^k - \sum_{j = 1}^k f_j x^{k - j}, \quad a_n = \sum_{i = 0}^{k - 1} a_i [x^i] \left(x^n \bmod F(x)\right)
$$

提交记录：[258089661](https://www.luogu.com.cn/record/258089661)。嘿，不是最优解，看看最优解都是什么。

![](https://cdn.luogu.com.cn/upload/image_hosting/uf0sxu24.png)

请输入文本。

但是这么劣的解法居然能冲上第一页，还是有点意思的。那么就尝试一下更快的解法。我们不妨假设 $n \ge k$，定义反转算子 $\mathscr R: f^{\mathscr{R}}(x) = x^{\deg f} f\left(\frac{1}{x}\right)$。考虑多项式取模的过程：

$$
\begin{aligned}
    & & x^n & = F(x) Q(x) + R(x) \\
    \implies & & 1 & = F^{\mathscr R}(x) Q^{\mathscr R} (x) + x^{n - k + 1} R^{\mathscr R}(x) \\
    \implies & & Q^{\mathscr R}(x) & = F^{\mathscr R}(x)^{-1} \bmod x^{n - k + 1}
\end{aligned}
$$

我们要求的答案是 $a_n = \sum_{i = 0}^{k - 1} a_i [x^i] R(x)$，即：

$$
[x^{k - 1}] R^{\mathscr R}(x) \sum_{i = 0}^{k - 1} a_i x^i = [x^{k - 1}] R^{\mathscr R}(x) A(x)
$$

那么回带到式子里面：

$$
\begin{aligned}
    a_n & = [x^{k - 1}] R^{\mathscr R}(x) A(x) \\
    & = [x^{n}] x^{n - k + 1} R^{\mathscr R}(x) A(x) \\
    & = [x^n] \left(1 - F^{\mathscr R}(x) Q^{\mathscr R}(x)\right) A(x) \\
    & = [x^n] \left(F^{\mathscr R}(x)^{-1} - Q^{\mathscr R}(x)\right) F^{\mathscr R}(x) A(x)
\end{aligned}
$$

因为 $F^{\mathscr R}(x)^{-1} - Q^{\mathscr{R}}(x) = O(x^{n - k + 1})$，而我们只需要 $[x^n]$ 系数，那么我们可以令 $B(x) = F^{\mathscr R}(x) A(x) \bmod x^k$，那么：

$$
a_n = [x^n] \left(F^{\mathscr R}(x)^{-1} - Q^{\mathscr R}(x)\right) B(x)
$$

同时，$\deg P(x) + \deg Q^{\mathscr R}(x) = (k - 1) + (n - k) = n - 1 < n$。因此这部分对答案没有贡献：

$$
a_n = [x^n] F^{\mathscr R}(x)^{-1} B(x) = [x^n] \frac{B(x)}{F^{\mathscr R}(x)}
$$

现在我们把问题转化成了有理分式系数值的形式。这个问题有一个快速解法叫做 Bostan-Mori 算法，还是比较新的科技（2021 年）。

> 问题：求 $\mathrm{Ans} = [x^n] \frac{f(x)}{g(x)}$。
>
> 我们将分式上下同乘 $g(-x)$，得到：
>
> $$
> \mathrm{Ans} = [x^n] \frac{f(x) g(-x)}{g(x) g(-x)}
> $$
>
> 因为 $g(x) g(-x)$ 是偶函数，只有偶次项有值，我们可以写成：
>
> $$
> \mathrm{Ans} = [x^n] \frac{P_0(x^2) + x P_1(x^2)}{Q(x^2)} = \left[x^{\lfloor n / 2\rfloor}\right] \frac{P_{n \bmod 2}(x)}{Q(x)}
> $$
>
> 于是规模减半。递归边界为 $[x^0] \frac{f(x)}{g(x)} = \frac{[x^0]f(x)}{[x^0]g(x)}$。记 $m$ 为多项式的度数，那么时间复杂度是 $O(m \log m \log n)$。
>
> ~~此事在[《最新最热多项式复合逆》](/blog/posts/latest-formal-series-inverse/)中亦有记载。~~

那么就可以写出代码：

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 18)>;

int a[100005], f[100005];

Mint calc(int n, Poly f, Poly g) {
    if (n < g.size()) return (f *= inv(g))[n];
    Poly tmp = g;
    for (int i = 1; i < tmp.size(); i += 2) tmp[i] = -tmp[i];
    f *= tmp, g *= tmp;
    int k = n & 1;
    for (int i = k; i < f.size(); i += 2) f[i / 2] = f[i];
    for (int i = 0; i < g.size(); i += 2) g[i / 2] = g[i];
    f.resize((f.size() - k - 1) / 2 + 1);
    g.resize((g.size() + 1) / 2);
    return calc(n / 2, std::move(f), std::move(g));
}

int main() {
    auto [n, K] = qin.scan<int, int>().value();
    for (int i = 1; i <= K; i++) f[i] = -qin.scan<int>().value();
    for (int i = 0; i < K; i++) a[i] = qin.scan<int>().value();
    f[0] = 1;
    Poly Q(f, f + K + 1), P = Q * Poly(a, a + K);
    P.resize(K);
    qout.println(calc(n, P, Q)());
    return 0;
}
```

提交记录：[259013334](https://www.luogu.com.cn/record/259013334)。截至 2026.1.25 非作弊最优解。

接下来进入暴力过题环节。

### 多项式多点求值

这里随便写一个转置原理的多点求值：

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353, MAXN = 64000;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 18)>;

Mint a[MAXN + 5], f[MAXN + 5], ans[MAXN + 5];

Poly Q[4 * MAXN];
#define LC (i << 1)
#define RC (i << 1 | 1)

void prepare(int l, int r, int i = 1) {
    if (l + 1 == r) return Q[i] = Poly({1, -a[l]}), void();
    int mid = (l + r) >> 1;
    prepare(l, mid, LC);
    prepare(mid, r, RC);
    Q[i] = Q[LC] * Q[RC];
}

Poly transMul(Poly f, Poly g) {
    int n = f.size(), m = g.size();
    std::ranges::reverse(f);
    g *= f;
    std::move(g.begin() + n - 1, g.end(), g.begin());
    g.resize(m);
    return g;
}

void solve(int l, int r, Poly v, int i = 1) {
    if (l + 1 == r) return ans[l] = v[0], void();
    int mid = (l + r) >> 1;
    Poly vl = transMul(Q[RC], v);
    Poly vr = transMul(Q[LC], std::move(v));
    vl.resize(mid - l);
    vr.resize(r - mid);
    solve(l, mid, std::move(vl), LC);
    solve(mid, r, std::move(vr), RC);
}

int main() {
    auto [n, m] = qin.scan<int, int>().value();
    n++;
    for (int i = 0; i < n; i++) f[i] = qin.scan<int>().value();
    for (int i = 0; i < m; i++) a[i] = qin.scan<int>().value();

    int N = std::max(n, m);
    prepare(0, N);
    solve(0, N, transMul(inv(Q[1]), Poly(f, f + N)));

    for (int i = 0; i < m; i++) qout.println(ans[i]());
    return 0;
}
```

提交记录：[259107303](https://www.luogu.com.cn/record/259107303)。这次不是最优解。大致看了一下，最优解用了更加侵入式的优化，懒得实现了。毕竟用这种粗糙的实现还达到相对较快的速度已经实现了这个多项式模板的目的。

### 多项式快速插值

依旧是粗糙写法：

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353, MAXN = 100000;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 18)>;

Mint X[MAXN + 5], Y[MAXN + 5], val[MAXN + 5];
Poly P[4 * MAXN], Q[4 * MAXN];
#define LC (i << 1)
#define RC (i << 1 | 1)

void prepare(int l, int r, int i = 1) {
    if (l + 1 == r) {
        P[i] = Poly{-X[l], 1};
        Q[i] = Poly{1, -X[l]};
        return;
    }
    int mid = (l + r) >> 1;
    prepare(l, mid, LC);
    prepare(mid, r, RC);
    Q[i] = Q[LC] * Q[RC];
    P[i] = P[LC] * P[RC];
}

Poly transMul(Poly f, Poly g) {
    int m = f.size();
    std::ranges::reverse(f), f *= g;
    std::move(f.begin() + m - 1, f.end(), g.begin());
    return g;
}

void eval(int l, int r, Poly v, int i = 1) {
    if (l + 1 == r) return val[l] = v[0], void();
    v.resize(r - l);
    int mid = (l + r) >> 1;
    eval(l, mid, transMul(Q[RC], v), LC);
    eval(mid, r, transMul(Q[LC], v), RC);
}

Poly interpolate(int l, int r, int i = 1) {
    if (l + 1 == r) return Poly{Y[l] / val[l]};
    int mid = (l + r) >> 1;
    return interpolate(l, mid, LC) * P[RC] + interpolate(mid, r, RC) * P[LC];
}

int main() {
    int n = qin.scan<int>().value();
    for (int i = 0; i < n; i++) {
        std::tie(X[i], Y[i]) = qin.scan<int, int>().value();
    }
    prepare(0, n);
    eval(0, n, transMul(inv(Q[1]), derivative(P[1])));
    Poly res = interpolate(0, n);
    for (int i = 0; i < n; i++) qout.print(res[i](), "");
    return 0;
}
```

提交记录：[259160845](https://www.luogu.com.cn/record/259160845)。也不是最优解。~~夺取最优解不妨留给读者作为课后练习。~~

### 多项式复合逆

我们把[《最新最热多项式复合逆》](/blog/posts/latest-formal-series-inverse/)的解法逐字逐句翻译成代码，就变成如下的样子：

```cpp
using cp::qin, cp::qout;

constexpr int MOD = 998244353, MAXN = 100000;
using Mint = cp::SModint<MOD>;
using Poly = cp::FPoly<MOD, (1 << 18)>;

unsigned a[MAXN + 5];

class XYPoly {
public:
    XYPoly() = default;
    XYPoly(const std::initializer_list<std::initializer_list<Mint>>& init):
        _nx(init.size()), _ny(0) {
        _f.reserve(_nx);
        for (auto& inner: init) {
            _f.push_back(Poly(inner));
            _ny = std::max(_ny, inner.size());
        }
        for (auto& row: _f) row.resize(_ny);
    }
    XYPoly(size_t nx, size_t ny): _nx(nx), _ny(ny), _f(nx, Poly(ny)) {}

    auto& operator[](size_t idx) { return _f[idx]; }
    auto& operator[](size_t idx) const { return _f[idx]; }

    size_t size_x() const { return _nx; }
    size_t size_y() const { return _ny; }
    void resize_x(size_t new_x) {
        if (new_x > _nx) _f.resize(new_x, Poly(_ny));
        else _f.resize(new_x);
        _nx = new_x;
    }
    void resize_y(size_t new_y) {
        for (auto& row: _f) row.resize(new_y);
        _ny = new_y;
    }

    friend XYPoly operator*(const XYPoly& f, const XYPoly& g) {
        auto nx = f.size_x(), ny = f.size_y();
        auto mx = g.size_x(), my = g.size_y();

        auto sx = nx + mx - 1, sy = ny + my - 1;
        Poly A(nx * sy), B(mx * sy);
        for (size_t i = 0; i < nx; i++)
            std::ranges::copy(f[i], A.begin() + i * sy);
        for (size_t i = 0; i < mx; i++)
            std::ranges::copy(g[i], B.begin() + i * sy);
        A *= B;

        XYPoly res(sx, sy);
        for (size_t i = 0; i < sx; i++)
            std::copy_n(A.begin() + i * sy, sy, res[i].begin());
        return res;
    }

private:
    size_t _nx = 0, _ny = 0;
    std::vector<Poly> _f{};
};

Poly quotient(XYPoly f, XYPoly g, size_t n) {
    if (n == 0) return f[0] / g[0];
    XYPoly tmp = g;
    for (size_t i = 1; i < tmp.size_x(); i += 2) tmp[i] = -std::move(tmp[i]);
    f = f * tmp;
    g = g * tmp;
    size_t sf = 0, sg = 0;
    for (size_t i = n % 2; i < f.size_x() && sf <= n / 2; i += 2)
        f[sf++] = std::move(f[i]);
    for (size_t i = 0; i < g.size_x() && sg <= n / 2; i += 2)
        g[sg++] = std::move(g[i]);
    f.resize_x(sf);
    g.resize_x(sg);
    return quotient(std::move(f), std::move(g), n / 2);
}

Poly compInv(Poly f) {
    if (f.size() > 0 && f[0]() != 0)
        throw std::invalid_argument("compositional inverse does not exist");
    if (f.size() < 2) return Poly{};

    size_t K = f.size() - 1;
    Mint v = f[1].inv();
    f *= v;

    Poly g = [&]() {
        XYPoly q(K + 1, 2);
        q[0][0] = 1;
        for (size_t i = 0; i <= K; i++) q[i][1] = -f[i];
        return quotient(XYPoly{{1}}, std::move(q), K);
    }();
    g.resize(K + 1);
    std::ranges::reverse(g);
    for (size_t i = 0; i < K; i++) g[i] *= Mint{K} / Mint{K - i};

    auto h = exp(ln(g) * (-Mint{K}.inv()));
    Mint step = v;
    g[0] = 0;
    for (size_t i = 0; i < K; i++) g[i + 1] = h[i] * step, step *= v;
    return g;
}

int main() {
    int n = qin.scan<int>().value();
    for (int i = 0; i < n; i++) a[i] = qin.scan<unsigned>().value();
    Poly res = compInv(Poly(a, a + n));
    for (int i = 0; i < n; i++) {
        qout.print(res[i]());
        qout.print(i == n - 1 ? '\n' : ' ');
    }
    return 0;
}
```

提交记录：[259237748](https://www.luogu.com.cn/record/259237748)。我们的实现非常粗糙，除了消除一些不必要拷贝之外基本没有优化，就是把数学公式字面翻译成了代码而已，但是仍然有着很好的效率。
