from sympy import *
import matplotlib.pyplot as plt
import numpy as np

# 1. 수식 정의 및 풀이
t = Symbol('t', real=True)
x1 = Function('x1')(t)
x2 = Function('x2')(t)

# ODE 시스템 정의
eq1 = Eq(x1.diff(t, 2), -8*x1 + 2*x2)
eq2 = Eq(x2.diff(t, 2), 2*x1 - 5*x2)

# 초기조건 설정 (t=0일 때 x1=1, x1'=0, x2=-1, x2'=0)
ics = {x1.subs(t, 0): 1, x1.diff(t).subs(t, 0): 0,
       x2.subs(t, 0): -1, x2.diff(t).subs(t, 0): 0}

# dsolve를 이용해 정밀해 구하기
sol = dsolve([eq1, eq2], [x1, x2], ics=ics)
print("--- [PART A] Example 1 구한 해 ---")
print(simplify(sol[0]))
print(simplify(sol[1]))

# 2. 그래프 시각화 (t 범위 0 ~ 10)
dt = np.linspace(0, 10, 1000)
x1_func = lambdify(t, sol[0].rhs, 'numpy')
x2_func = lambdify(t, sol[1].rhs, 'numpy')

plt.figure(figsize=(7, 4))
plt.plot(dt, x1_func(dt), label='$x_1(t)$', color='blue')
plt.plot(dt, x2_func(dt), label='$x_2(t)$', color='orange')
plt.axhline(0, color='black', linewidth=0.5, linestyle='--')
plt.title('[PART A] Example 1: Coupled Oscillators Time Response')
plt.xlabel('Time (t)')
plt.ylabel('Displacement')
plt.legend()
plt.grid(True)
plt.show()