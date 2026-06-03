from sympy import *
import matplotlib.pyplot as plt
import numpy as np

# 1. 기호 정의 및 변수 선언
t = Symbol('t', real=True)
theta1 = Function('theta1')(t)
theta2 = Function('theta2')(t)

# 시스템 방정식 정의
eq1 = Eq(8*theta1.diff(t, 2) + 2*theta2.diff(t, 2) + 5*theta1, 0)
eq2 = Eq(8*theta1.diff(t, 2) + 8*theta2.diff(t, 2) + 5*theta2, 0)

# 초기조건 적용
ics = {theta1.subs(t, 0): 1, theta1.diff(t).subs(t, 0): 0,
       theta2.subs(t, 0): -1, theta2.diff(t).subs(t, 0): 0}

# 해 구하기
sol = dsolve([eq1, eq2], [theta1, theta2], ics=ics)
print("--- [PART A] Example 2 구한 해 ---")
print("theta1(t) =", simplify(sol[0].rhs))
print("theta2(t) =", simplify(sol[1].rhs))

# 2. 결과 시각화
dt = np.linspace(0, 20, 1000)
theta1_func = lambdify(t, sol[0].rhs, 'numpy')
theta2_func = lambdify(t, sol[1].rhs, 'numpy')

plt.figure(figsize=(7, 4))
plt.plot(dt, theta1_func(dt), label=r'$\theta_1(t)$', color='crimson')
plt.plot(dt, theta2_func(dt), label=r'$\theta_2(t)$', color='navy')
plt.axhline(0, color='black', linewidth=0.5, linestyle='--')
plt.title('[PART A] Example 2: Double Pendulum Linearized Response')
plt.xlabel('Time (t)')
plt.ylabel('Angle (rad)')
plt.legend()
plt.grid(True)
plt.show()